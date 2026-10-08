import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/inventory/items — stock items (for movements). */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["inventory.manage", "inventory.movement", "inventory.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.inventoryItem.findMany({
    orderBy: { name: "asc" },
    take: 200,
    select: { id: true, name: true, sku: true, unit: true, quantity: true, reorderLevel: true },
  });

  return cors(NextResponse.json({
    items: rows.map((i) => ({
      id: i.id, name: i.name, sku: i.sku, unit: i.unit,
      quantity: i.quantity, low: i.quantity <= i.reorderLevel,
    })),
  }));
}
