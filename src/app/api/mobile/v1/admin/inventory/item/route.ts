import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  name: z.string().trim().min(2, "An item name is required").max(120),
  sku: z.string().trim().max(60).optional(),
  unit: z.string().trim().max(20).optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  reorderLevel: z.union([z.string(), z.number()]).optional(),
  location: z.string().trim().max(80).optional(),
});

/** POST /api/mobile/v1/admin/inventory/item — add a stock item. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "inventory.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const qty = Math.max(0, Math.trunc(Number(parsed.data.quantity ?? 0)) || 0);
  const reorder = Math.max(0, Math.trunc(Number(parsed.data.reorderLevel ?? 0)) || 0);

  const db = scopedDb(session.schoolId);
  const item = await db.inventoryItem.create({
    data: {
      schoolId: session.schoolId,
      name: parsed.data.name,
      sku: parsed.data.sku || null,
      unit: parsed.data.unit || "unit",
      quantity: qty,
      reorderLevel: reorder,
      location: parsed.data.location || null,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "inventory.item.create", entityType: "InventoryItem", entityId: item.id,
    after: { name: item.name, quantity: qty, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, id: item.id, message: `“${item.name}” added to inventory.` }));
}
