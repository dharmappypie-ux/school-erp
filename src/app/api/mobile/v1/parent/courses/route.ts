import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { catalogScope, classLevelIdForStudent, resolveStudentId } from "@/lib/mobile-portal";
import { courseProgress } from "@/lib/lms";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/parent/courses
 *
 * Published courses available to the child's class, each with the child's own
 * lesson-completion progress — the mobile mirror of the web /portal/courses.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const studentId = await resolveStudentId(db, session.studentId, session.guardianId);
  if (!studentId) return cors(NextResponse.json({ items: [] }));

  const classLevelId = await classLevelIdForStudent(db, studentId, session.academicYearId);

  const courses = await db.course.findMany({
    where: { status: "PUBLISHED", ...catalogScope(classLevelId) },
    orderBy: [{ subject: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      summary: true,
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
      lessons: {
        select: {
          durationMinutes: true,
          progress: { where: { studentId }, select: { id: true } },
        },
      },
    },
  });

  return cors(NextResponse.json({
    items: courses.map((c) => {
      const total = c.lessons.length;
      const done = c.lessons.filter((l) => l.progress.length > 0).length;
      const minutes = c.lessons.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0);
      return {
        id: c.id,
        title: c.title,
        summary: c.summary,
        subject: c.subject?.name ?? "",
        teacher: c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName ?? ""}`.trim() : null,
        lessons: total,
        lessonsDone: done,
        percent: courseProgress(done, total),
        minutes,
      };
    }),
  }));
}
