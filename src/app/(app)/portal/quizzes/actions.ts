"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { getPortalContext } from "@/lib/portal";
import { gradeAttempt, isQuizOpen, type GradableQuestion } from "@/lib/quiz";
import { scopedDb } from "@/lib/tenant";

export interface SubmitResult {
  ok: boolean;
  message: string;
  score?: number;
  totalPoints?: number;
}

/**
 * Grades and stores a student's quiz attempt. Everything is checked server-side:
 * the child must belong to the viewer, the quiz must be published, open and
 * meant for the child's class, and it must not already have been attempted.
 * Grading uses the shared `gradeAttempt`, so the score cannot be spoofed from
 * the client — only the chosen options are trusted.
 */
export async function submitQuizAttempt(
  quizId: string,
  childId: string,
  answers: Record<string, number | null>,
): Promise<SubmitResult> {
  await requirePermission("quiz.attempt");
  const context = await getPortalContext();
  const child = context.children.find((candidate) => candidate.id === childId);
  if (!child) return { ok: false, message: "That student is not linked to your account." };

  const db = scopedDb(context.session.schoolId);
  const yearId = context.session.academicYear?.id;

  const enrollment = await db.enrollment.findFirst({
    where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { section: { select: { classLevelId: true } } },
  });
  const classLevelId = enrollment?.section.classLevelId ?? null;

  // The quiz must be one this child may see. Quiz is tenant-scoped; the status
  // and class filter enforce visibility.
  const quiz = await db.quiz.findFirst({
    where: {
      id: quizId,
      status: "PUBLISHED",
      OR: [{ classLevelId: null }, ...(classLevelId ? [{ classLevelId }] : [])],
    },
    select: {
      id: true,
      status: true,
      availableFrom: true,
      availableUntil: true,
      questions: { select: { id: true, correctOption: true, points: true } },
    },
  });
  if (!quiz) return { ok: false, message: "That quiz is not available." };
  if (!isQuizOpen(quiz)) return { ok: false, message: "This quiz is closed." };
  if (quiz.questions.length === 0) return { ok: false, message: "This quiz has no questions." };

  // One attempt per student. Reaching through the scoped quiz keeps it tenant-safe.
  // tenant-safe: quizId belongs to this school (scoped lookup above); studentId
  // is the viewer's own verified child.
  const existing = await db.quizAttempt.findFirst({
    where: { quizId, studentId: child.id },
    select: { id: true, completedAt: true },
  });
  if (existing?.completedAt) {
    return { ok: false, message: "You have already completed this quiz." };
  }

  const selections = new Map<string, number | null>();
  for (const question of quiz.questions) {
    const chosen = answers[question.id];
    selections.set(question.id, typeof chosen === "number" ? chosen : null);
  }

  const questions: GradableQuestion[] = quiz.questions.map((q) => ({
    id: q.id,
    correctOption: q.correctOption,
    points: q.points,
  }));
  const { score, totalPoints, graded } = gradeAttempt(questions, selections);

  // tenant-safe: quizId is this school's (scoped lookup); studentId is the
  // viewer's own child. Answers are created nested under the attempt.
  await db.quizAttempt.create({
    data: {
      quizId,
      studentId: child.id,
      score,
      totalPoints,
      completedAt: new Date(),
      answers: {
        create: graded.map((g) => ({
          questionId: g.questionId,
          selectedOption: g.selectedOption,
          isCorrect: g.isCorrect,
          pointsAwarded: g.pointsAwarded,
        })),
      },
    },
  });

  revalidatePath("/portal/quizzes");
  revalidatePath(`/portal/quizzes/${quizId}`);
  return { ok: true, message: `You scored ${score} of ${totalPoints}.`, score, totalPoints };
}
