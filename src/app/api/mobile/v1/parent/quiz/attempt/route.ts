import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { catalogScope, classLevelIdForStudent, resolveStudentId } from "@/lib/mobile-portal";
import { gradeAttempt, isQuizOpen, scorePercent, type GradableQuestion } from "@/lib/quiz";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  quizId: z.string().min(1),
  // question id -> chosen option index (or null for unanswered)
  answers: z.record(z.string(), z.number().int().nullable()),
});

/**
 * POST /api/mobile/v1/parent/quiz/attempt
 *
 * Submits and grades the child's quiz attempt — the mobile mirror of the web
 * `submitQuizAttempt`. One attempt per quiz; grading runs server-side so the
 * correct answers never leave the server before the attempt is recorded.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { quizId, answers } = parsed.data;

  const db = scopedDb(session.schoolId);
  const studentId = await resolveStudentId(db, session.studentId, session.guardianId);
  if (!studentId) return cors(NextResponse.json({ error: "No student is linked to this account." }, { status: 404 }));

  const classLevelId = await classLevelIdForStudent(db, studentId, session.academicYearId);

  const quiz = await db.quiz.findFirst({
    where: { id: quizId, status: "PUBLISHED", ...catalogScope(classLevelId) },
    select: {
      id: true, status: true, availableFrom: true, availableUntil: true,
      questions: { select: { id: true, correctOption: true, points: true } },
    },
  });
  if (!quiz) return cors(NextResponse.json({ error: "That quiz is not available." }, { status: 404 }));
  if (!isQuizOpen(quiz)) return cors(NextResponse.json({ error: "This quiz is closed." }, { status: 409 }));
  if (quiz.questions.length === 0) return cors(NextResponse.json({ error: "This quiz has no questions." }, { status: 400 }));

  const existing = await db.quizAttempt.findFirst({
    where: { quizId, studentId },
    select: { id: true, completedAt: true },
  });
  if (existing?.completedAt) {
    return cors(NextResponse.json({ error: "You have already completed this quiz." }, { status: 409 }));
  }

  const selections = new Map<string, number | null>();
  for (const question of quiz.questions) {
    const chosen = answers[question.id];
    selections.set(question.id, typeof chosen === "number" ? chosen : null);
  }

  const questions: GradableQuestion[] = quiz.questions.map((q) => ({
    id: q.id, correctOption: q.correctOption, points: q.points,
  }));
  const { score, totalPoints, graded } = gradeAttempt(questions, selections);

  await db.quizAttempt.create({
    data: {
      quizId,
      studentId,
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

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "quiz.attempt", entityType: "Quiz", entityId: quizId,
    after: { score, totalPoints, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    score,
    totalPoints,
    percent: scorePercent(score, totalPoints),
    message: `Scored ${score}/${totalPoints}.`,
  }));
}
