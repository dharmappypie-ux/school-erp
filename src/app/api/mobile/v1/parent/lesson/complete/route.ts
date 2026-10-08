import { NextResponse } from "next/server";
import { z } from "zod";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { catalogScope, classLevelIdForStudent, resolveStudentId } from "@/lib/mobile-portal";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  lessonId: z.string().min(1),
  complete: z.boolean(),
});

/**
 * POST /api/mobile/v1/parent/lesson/complete
 *
 * Toggles the child's completion of one lesson — the mobile mirror of the web
 * `setLessonProgress`. The lesson must belong to a published course available to
 * the child's class, so a student can only ever mark their own catalogue.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { lessonId, complete } = parsed.data;

  const db = scopedDb(session.schoolId);
  const studentId = await resolveStudentId(db, session.studentId, session.guardianId);
  if (!studentId) return cors(NextResponse.json({ error: "No student is linked to this account." }, { status: 404 }));

  const classLevelId = await classLevelIdForStudent(db, studentId, session.academicYearId);

  const lesson = await db.lesson.findFirst({
    where: {
      id: lessonId,
      course: { status: "PUBLISHED", ...catalogScope(classLevelId) },
    },
    select: { id: true, courseId: true },
  });
  if (!lesson) return cors(NextResponse.json({ error: "That lesson is not available." }, { status: 404 }));

  if (complete) {
    await db.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      create: { lessonId, studentId },
      update: { completedAt: new Date() },
    });
  } else {
    await db.lessonProgress.deleteMany({ where: { lessonId, studentId } });
  }

  return cors(NextResponse.json({
    ok: true,
    complete,
    message: complete ? "Marked complete." : "Marked incomplete.",
  }));
}
