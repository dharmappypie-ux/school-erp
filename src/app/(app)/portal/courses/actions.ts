"use server";

import { revalidatePath } from "next/cache";

import { getPortalContext } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Marks a lesson complete or incomplete for one of the viewer's children.
 *
 * `childId` is untrusted, so it is checked against the viewer's own children
 * before anything is written — a portal user must never be able to record
 * progress against a student who is not theirs. The lesson is likewise checked
 * to belong to a course the child is actually entitled to see (published, and
 * targeted at their class or the whole school).
 */
export async function setLessonProgress(
  lessonId: string,
  childId: string,
  complete: boolean,
): Promise<ActionResult> {
  const context = await getPortalContext();
  const child = context.children.find((candidate) => candidate.id === childId);
  if (!child) return { ok: false, message: "That student is not linked to your account." };

  const db = scopedDb(context.session.schoolId);
  const yearId = context.session.academicYear?.id;

  // Which class is this child in this year? Courses target a class level.
  const enrollment = await db.enrollment.findFirst({
    where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { section: { select: { classLevelId: true } } },
  });
  const classLevelId = enrollment?.section.classLevelId ?? null;

  // tenant-safe: the lesson is reached through its course, which is filtered to
  // this school (schoolId) as well as to a status/class the child may see.
  const lesson = await db.lesson.findFirst({
    where: {
      id: lessonId,
      course: {
        schoolId: context.session.schoolId,
        status: "PUBLISHED",
        OR: [{ classLevelId: null }, ...(classLevelId ? [{ classLevelId }] : [])],
      },
    },
    select: { id: true, courseId: true },
  });
  if (!lesson) return { ok: false, message: "That lesson is not available." };

  if (complete) {
    // tenant-safe: studentId is the viewer's own verified child, and lessonId
    // was proven above to belong to a course in this school they may see.
    await db.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId: child.id } },
      create: { lessonId, studentId: child.id },
      update: { completedAt: new Date() },
    });
  } else {
    // tenant-safe: studentId is the viewer's own verified child, and lessonId
    // was proven above to belong to a course in this school they may see.
    await db.lessonProgress.deleteMany({ where: { lessonId, studentId: child.id } });
  }

  revalidatePath(`/portal/courses/${lesson.courseId}`);
  revalidatePath("/portal/courses");
  return { ok: true, message: complete ? "Marked complete." : "Marked incomplete." };
}
