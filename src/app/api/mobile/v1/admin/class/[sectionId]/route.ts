import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/class/[sectionId] — a class's roster + subjects. */
export async function GET(req: Request, ctx: { params: Promise<{ sectionId: string }> }) {
  const guard = await requireMobile(req, ["academics.read", "academics.manage", "students.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { sectionId } = await ctx.params;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: {
      id: true, name: true, capacity: true, roomNumber: true, classLevelId: true,
      classLevel: { select: { name: true } },
      classTeacher: { select: { firstName: true, lastName: true } },
    },
  });
  if (!section) return cors(NextResponse.json({ error: "Class not found in your school." }, { status: 404 }));

  const [enrollments, subjects] = await Promise.all([
    db.enrollment.findMany({
      where: { sectionId, isActive: true, ...(yearId ? { academicYearId: yearId } : {}) },
      select: { student: { select: { firstName: true, lastName: true, rollNumber: true, admissionNo: true } } },
    }),
    db.classSubject.findMany({
      where: { OR: [{ sectionId }, { sectionId: null, classLevelId: section.classLevelId }] },
      select: {
        subject: { select: { name: true, code: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const students = enrollments
    .map((e) => e.student)
    .sort((a, b) => (a.rollNumber ?? "").localeCompare(b.rollNumber ?? "", undefined, { numeric: true }))
    .map((s) => ({
      name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
      rollNumber: s.rollNumber,
      admissionNo: s.admissionNo,
    }));

  const ct = section.classTeacher;
  return cors(NextResponse.json({
    id: section.id,
    name: `${section.classLevel.name} · ${section.name}`,
    classTeacher: ct ? `${ct.firstName} ${ct.lastName ?? ""}`.trim() : null,
    room: section.roomNumber,
    capacity: section.capacity,
    students,
    subjects: subjects.map((cs) => ({
      name: cs.subject.name,
      code: cs.subject.code,
      teacher: cs.teacher ? `${cs.teacher.firstName} ${cs.teacher.lastName ?? ""}`.trim() : null,
    })),
  }));
}
