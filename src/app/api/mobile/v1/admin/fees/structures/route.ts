import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/fees/structures — billable fee structures (current year). */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["fees.invoice", "fees.manage", "fees.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const rows = await db.feeStructure.findMany({
    where: yearId ? { academicYearId: yearId } : {},
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      classLevel: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return cors(NextResponse.json({
    items: rows.map((s) => ({
      id: s.id,
      name: s.name,
      className: s.classLevel?.name ?? "Whole school",
      heads: s._count.items,
    })),
  }));
}
