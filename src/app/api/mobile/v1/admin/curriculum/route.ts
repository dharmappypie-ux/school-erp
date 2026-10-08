import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/curriculum?classLevelId=
 *
 * Picker data for the curriculum editor: class levels, subjects and teachers,
 * plus — when a classLevelId is given — that class's current subject mappings.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["academics.read", "academics.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const classLevelId = new URL(req.url).searchParams.get("classLevelId");

  const [classLevels, subjects, teachers, mappings] = await Promise.all([
    db.classLevel.findMany({ orderBy: { numericOrder: "asc" }, select: { id: true, name: true } }),
    db.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    db.staffMember.findMany({
      where: { employmentStatus: "ACTIVE", deletedAt: null },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
    classLevelId
      ? db.classSubject.findMany({
          where: { classLevelId, sectionId: null },
          select: {
            id: true, subjectId: true, teacherId: true, weeklyPeriods: true, maxMarks: true, passMarks: true,
            subject: { select: { name: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        })
      : [],
  ]);

  const canManage = guard.permissions.includes("*") ||
    guard.permissions.includes("academics.manage") || guard.permissions.includes("academics.*");

  return cors(NextResponse.json({
    canManage,
    classLevels,
    subjects,
    teachers: teachers.map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName ?? ""}`.trim() })),
    mappings: mappings.map((m) => ({
      subjectId: m.subjectId,
      subject: m.subject.name,
      teacherId: m.teacherId,
      teacher: m.teacher ? `${m.teacher.firstName} ${m.teacher.lastName ?? ""}`.trim() : null,
      weeklyPeriods: m.weeklyPeriods,
      maxMarks: m.maxMarks != null ? toNumber(m.maxMarks) : null,
      passMarks: m.passMarks != null ? toNumber(m.passMarks) : null,
    })),
  }));
}
