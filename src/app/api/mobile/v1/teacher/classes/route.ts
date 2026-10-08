import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/teacher/classes
 *
 * The classes a signed-in teacher can act on, plus the subjects they teach (for
 * the "set homework" / "enter marks" pickers). Scoped to the teacher via their
 * StaffMember id: sections they are class-teacher of, and sections reached
 * through their per-subject assignments. If none resolve (e.g. an admin, or a
 * demo account not yet linked to assignments) it falls back to every current
 * section so the tools are still usable, flagging `scoped: false`.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["attendance.mark", "marks.enter", "homework.manage", "exams.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  const staffId = session.staffId;

  const sectionIds = new Set<string>();
  const classLevelIds = new Set<string>();
  const classTeacherSections = new Set<string>();
  let subjects: { id: string; name: string; code: string }[] = [];

  if (staffId) {
    const [owned, assignments] = await Promise.all([
      db.section.findMany({
        where: { classTeacherId: staffId, ...(yearId ? { academicYearId: yearId } : {}) },
        select: { id: true },
      }),
      db.classSubject.findMany({
        where: { teacherId: staffId },
        select: {
          sectionId: true,
          classLevelId: true,
          subject: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);
    for (const s of owned) {
      sectionIds.add(s.id);
      classTeacherSections.add(s.id);
    }
    const subjMap = new Map<string, { id: string; name: string; code: string }>();
    for (const a of assignments) {
      if (a.sectionId) sectionIds.add(a.sectionId);
      else classLevelIds.add(a.classLevelId);
      subjMap.set(a.subject.id, a.subject);
    }
    // Expand class-level-wide assignments to their sections in the current year.
    if (classLevelIds.size > 0) {
      const extra = await db.section.findMany({
        where: {
          classLevelId: { in: [...classLevelIds] },
          ...(yearId ? { academicYearId: yearId } : {}),
        },
        select: { id: true },
      });
      for (const s of extra) sectionIds.add(s.id);
    }
    subjects = [...subjMap.values()];
  }

  // Admins (wildcard) may browse any class; a teacher only ever sees the
  // sections they are class teacher of or teach a subject in — never the whole
  // school. A teacher with no assignments gets an empty list.
  const isAdmin = session.permissions.includes("*");
  let scoped = sectionIds.size > 0;
  const sectionWhere = scoped
    ? { id: { in: [...sectionIds] } }
    : isAdmin
      ? (yearId ? { academicYearId: yearId } : {})
      : { id: { in: [] as string[] } };

  const sections = await db.section.findMany({
    where: sectionWhere,
    orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
    take: 60,
    select: {
      id: true,
      name: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });

  if (subjects.length === 0 && isAdmin) {
    const subs = await db.subject.findMany({
      orderBy: { name: "asc" },
      take: 100,
      select: { id: true, name: true, code: true },
    });
    subjects = subs;
    scoped = false;
  }

  return cors(NextResponse.json({
    scoped,
    teacherName: session.name,
    sections: sections.map((s) => ({
      id: s.id,
      name: `${s.classLevel.name} · ${s.name}`,
      studentCount: s._count.enrollments,
      isClassTeacher: classTeacherSections.has(s.id),
    })),
    subjects,
  }));
}
