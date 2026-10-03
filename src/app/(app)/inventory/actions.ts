"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { applyMovement } from "@/lib/inventory";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const CategorySchema = z.object({
  name: z.string().trim().min(2, "A category name is required").max(80),
  description: z.string().trim().max(240).optional(),
});

/** Creates a stock category (Stationery, Lab equipment, Furniture …). */
export async function createCategory(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = CategorySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("inventory.manage");
  const db = scopedDb(session.schoolId);

  const clash = await db.inventoryCategory.findFirst({
    where: { name: parsed.data.name },
    select: { id: true },
  });
  if (clash) {
    return { ok: false, message: `A category named "${parsed.data.name}" already exists.`, values: raw };
  }

  const category = await db.inventoryCategory.create({
    data: {
      schoolId: session.schoolId,
      name: parsed.data.name,
      description: parsed.data.description || null,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "inventory.category.create",
    entityType: "InventoryCategory",
    entityId: category.id,
    after: { name: category.name },
  });

  revalidatePath("/inventory");
  return { ok: true, message: `Category "${category.name}" added.` };
}

const ItemSchema = z.object({
  name: z.string().trim().min(2, "An item name is required").max(120),
  sku: z.string().trim().max(60).optional(),
  categoryId: z.string().trim().optional(),
  unit: z.string().trim().max(20).optional(),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000),
  location: z.string().trim().max(80).optional(),
  unitCost: z.coerce.number().min(0).max(100_000_000).optional(),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Creates an inventory item. When it opens with stock on hand, an opening
 * movement is written too, so the item's quantity always matches its ledger
 * from the very first row.
 */
export async function createItem(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = ItemSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("inventory.manage");
  const db = scopedDb(session.schoolId);
  const data = parsed.data;

  if (data.categoryId) {
    const category = await db.inventoryCategory.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!category) return { ok: false, message: "That category does not exist.", values: raw };
  }

  const item = await db.inventoryItem.create({
    data: {
      schoolId: session.schoolId,
      name: data.name,
      sku: data.sku || null,
      categoryId: data.categoryId || null,
      unit: data.unit || "unit",
      quantity: data.quantity,
      reorderLevel: data.reorderLevel,
      location: data.location || null,
      unitCost: data.unitCost != null && !Number.isNaN(data.unitCost) ? data.unitCost : null,
      notes: data.notes || null,
      // Seed the ledger with an opening balance so history is never missing.
      movements:
        data.quantity > 0
          ? {
              create: {
                type: "IN",
                quantity: data.quantity,
                balanceAfter: data.quantity,
                note: "Opening stock",
                createdById: session.userId,
              },
            }
          : undefined,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "inventory.item.create",
    entityType: "InventoryItem",
    entityId: item.id,
    after: { name: item.name, quantity: data.quantity },
  });

  revalidatePath("/inventory");
  return { ok: true, message: `"${item.name}" added with ${data.quantity} ${data.unit || "unit"}(s) on hand.` };
}

const MovementSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["IN", "OUT", "ADJUST"]),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  note: z.string().trim().max(240).optional(),
  reference: z.string().trim().max(120).optional(),
});

/**
 * Records a stock movement and updates the item's on-hand quantity in one
 * transaction, so the balance and the ledger can never disagree.
 */
export async function recordMovement(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = MovementSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("inventory.movement");
  const db = scopedDb(session.schoolId);
  const { itemId, type, quantity, note, reference } = parsed.data;

  const item = await db.inventoryItem.findUnique({
    where: { id: itemId },
    select: { id: true, name: true, quantity: true, unit: true },
  });
  if (!item) return { ok: false, message: "Item not found.", values: raw };

  const result = applyMovement(item.quantity, type, quantity);
  if (!result.ok) return { ok: false, message: result.reason, values: raw };

  await db.$transaction([
    // tenant-safe: itemId was validated against the scoped item lookup above.
    db.inventoryItem.update({
      where: { id: itemId },
      data: { quantity: result.balance },
    }),
    // tenant-safe: itemId was validated against the scoped item lookup above.
    db.stockMovement.create({
      data: {
        itemId,
        type,
        quantity,
        balanceAfter: result.balance,
        note: note || null,
        reference: reference || null,
        createdById: session.userId,
      },
    }),
  ]);

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: `inventory.movement.${type.toLowerCase()}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { quantity: item.quantity },
    after: { type, quantity, balance: result.balance },
  });

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${itemId}`);
  const verb = type === "IN" ? "received" : type === "OUT" ? "issued" : "adjusted to";
  return {
    ok: true,
    message: `${item.name}: ${verb} ${quantity} ${item.unit}(s). On hand: ${result.balance}.`,
  };
}

/** Deletes an item and its whole movement ledger. */
export async function deleteItem(itemId: string): Promise<ActionResult> {
  const session = await requirePermission("inventory.manage");
  const db = scopedDb(session.schoolId);

  const item = await db.inventoryItem.findUnique({
    where: { id: itemId },
    select: { id: true, name: true },
  });
  if (!item) return { ok: false, message: "Item not found." };

  await db.inventoryItem.delete({ where: { id: item.id } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "inventory.item.delete",
    entityType: "InventoryItem",
    entityId: item.id,
    before: { name: item.name },
  });

  revalidatePath("/inventory");
  return { ok: true, message: `"${item.name}" and its stock history were removed.` };
}
