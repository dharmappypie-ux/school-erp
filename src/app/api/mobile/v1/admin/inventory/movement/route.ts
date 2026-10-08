import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { applyMovement } from "@/lib/inventory";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["IN", "OUT", "ADJUST"]),
  quantity: z.union([z.string(), z.number()]),
  note: z.string().trim().max(240).optional(),
  reference: z.string().trim().max(120).optional(),
});

/**
 * POST /api/mobile/v1/admin/inventory/movement — stock in/out/adjust, updating
 * the balance. Mirrors the web recordMovement (applyMovement rules).
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, ["inventory.movement", "inventory.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { itemId, type, note, reference } = parsed.data;
  const quantity = Math.trunc(Number(parsed.data.quantity));

  const db = scopedDb(session.schoolId);
  const item = await db.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true, name: true, quantity: true } });
  if (!item) return cors(NextResponse.json({ error: "Item not found in your school." }, { status: 404 }));

  const result = applyMovement(item.quantity, type, quantity);
  if (!result.ok) return cors(NextResponse.json({ error: result.reason }, { status: 400 }));

  await db.$transaction([
    db.inventoryItem.update({ where: { id: itemId }, data: { quantity: result.balance } }),
    db.stockMovement.create({
      data: { itemId, type, quantity, balanceAfter: result.balance, note: note || null, reference: reference || null, createdById: session.userId },
    }),
  ]);

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: `inventory.movement.${type.toLowerCase()}`, entityType: "InventoryItem", entityId: itemId,
    after: { type, quantity, balance: result.balance, via: "mobile" },
  });

  const verb = type === "IN" ? "received" : type === "OUT" ? "issued" : "adjusted to";
  return cors(NextResponse.json({
    ok: true,
    message: type === "ADJUST" ? `“${item.name}” ${verb} ${result.balance}.` : `${quantity} ${verb} — “${item.name}” now ${result.balance}.`,
  }));
}
