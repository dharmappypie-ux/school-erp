import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { catalogScope, classLevelIdForStudent, resolveStudentId } from "@/lib/mobile-portal";
import { courseProgress } from "@/lib/lms";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/parent/courses/[id]
 *
 * One published course with its lessons (content, video, resources) and the
 * child's per-lesson completion — the mobile mirror of /portal/courses/[id].
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const db = scopedDb(session.schoolId);
  const studentId = await resolveStudentId(db, session.studentId, session.guardianId);
  if (!studentId) return cors(NextResponse.json({ error: "No student is linked to this account." }, { status: 404 }));

  const classLevelId = await classLevelIdForStudent(db, studentId, session.academicYearId);

  const course = await db.course.findFirst({
    where: { id, status: "PUBLISHED", ...catalogScope(classLevelId) },
    select: {
      id: true,
      title: true,
      summary: true,
      description: true,
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
      lessons: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          title: true,
          content: true,
          videoUrl: true,
          durationMinutes: true,
          resources: {
            orderBy: { createdAt: "asc" },
            select: { id: true, title: true, type: true, url: true },
          },
          progress: { where: { studentId }, select: { id: true } },
        },
      },
      resources: {
        where: { lessonId: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, type: true, url: true },
      },
    },
  });

  if (!course) return cors(NextResponse.json({ error: "Course not found." }, { status: 404 }));

  const done = course.lessons.filter((l) => l.progress.length > 0).length;

  return cors(NextResponse.json({
    id: course.id,
    title: course.title,
    summary: course.summary,
    description: course.description,
    subject: course.subject?.name ?? null,
    classLevel: course.classLevel?.name ?? null,
    teacher: course.teacher ? `${course.teacher.firstName} ${course.teacher.lastName ?? ""}`.trim() : null,
    lessonsDone: done,
    lessonCount: course.lessons.length,
    percent: courseProgress(done, course.lessons.length),
    lessons: course.lessons.map((l) => ({
      id: l.id,
      sequence: l.sequence,
      title: l.title,
      content: l.content,
      videoUrl: l.videoUrl,
      durationMinutes: l.durationMinutes,
      done: l.progress.length > 0,
      resources: l.resources,
    })),
    resources: course.resources,
  }));
}
