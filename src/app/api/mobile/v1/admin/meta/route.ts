import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/meta
 *
 * Reference data for the admin create forms: the current sections (for
 * enrolling a student), the school's assignable roles (for new staff/users),
 * and the fixed staff-type options.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["students.create", "staff.create", "users.create", "academics.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const [sections, roles] = await Promise.all([
    db.section.findMany({
      where: yearId ? { academicYearId: yearId } : {},
      orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        capacity: true,
        classLevel: { select: { name: true } },
        _count: { select: { enrollments: { where: { isActive: true } } } },
      },
    }),
    db.role.findMany({
      where: { key: { notIn: ["PLATFORM_ADMIN", "SUPER_ADMIN", "STUDENT", "PARENT"] } },
      orderBy: { name: "asc" },
      select: { key: true, name: true },
    }),
  ]);

  return cors(NextResponse.json({
    sections: sections.map((s) => ({
      id: s.id,
      name: `${s.classLevel.name} · ${s.name}`,
      seatsLeft: Math.max(0, s.capacity - s._count.enrollments),
    })),
    roles: roles.map((r) => ({ key: r.key, name: r.name })),
    staffTypes: ["TEACHING", "NON_TEACHING", "ADMINISTRATIVE", "SUPPORT", "MANAGEMENT"],
    relationships: ["FATHER", "MOTHER", "GUARDIAN", "GRANDPARENT", "OTHER"],
  }));
}
