import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/sections
 *
 * The current year's classes, for anyone who may READ the academic structure.
 *
 * Deliberately separate from `admin/meta`: that endpoint feeds the create
 * forms, so it is gated on create permissions and hands back the school's
 * assignable role keys — which an accountant or librarian must not have. They
 * do hold `academics.read` though, which is what reveals the "Classes &
 * subjects" tile, so reading the class list needed an endpoint that asks for
 * exactly that and nothing more.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["academics.read", "academics.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const sections = await db.section.findMany({
    where: yearId ? { academicYearId: yearId } : {},
    orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      capacity: true,
      roomNumber: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });

  return cors(NextResponse.json({
    sections: sections.map((s) => ({
      id: s.id,
      name: `${s.classLevel.name} · ${s.name}`,
      capacity: s.capacity,
      filled: s._count.enrollments,
      seatsLeft: Math.max(0, s.capacity - s._count.enrollments),
      roomNumber: s.roomNumber,
    })),
  }));
}
