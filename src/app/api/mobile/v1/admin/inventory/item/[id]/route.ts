import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/inventory/item/[id]
 *
 * One stock item with its movement ledger — what the quantity on the list
 * screen is actually made of, which is the question a stock-take asks.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, "inventory.read");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const { id } = await ctx.params;
  const db = scopedDb(session.schoolId);

  const item = await db.inventoryItem.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      quantity: true,
      reorderLevel: true,
      location: true,
      unitCost: true,
      notes: true,
      category: { select: { name: true } },
      movements: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          type: true,
          quantity: true,
          balanceAfter: true,
          note: true,
          reference: true,
          createdAt: true,
        },
      },
    },
  });

  if (!item) {
    return cors(NextResponse.json({ error: "That item is not in your school." }, { status: 404 }));
  }

  const unitCost = item.unitCost == null ? null : toNumber(item.unitCost);

  return cors(NextResponse.json({
    item: {
      id: item.id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      quantity: item.quantity,
      reorderLevel: item.reorderLevel,
      location: item.location,
      notes: item.notes,
      category: item.category?.name ?? null,
      unitCost,
      value: unitCost == null ? null : unitCost * item.quantity,
      lowStock: item.quantity <= item.reorderLevel,
    },
    canMove: hasPermission(session.permissions, "inventory.movement"),
    movements: item.movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      balanceAfter: m.balanceAfter,
      note: m.note,
      reference: m.reference,
      at: m.createdAt.toISOString(),
    })),
  }));
}
