import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { catalogScope, classLevelIdForStudent, resolveStudentId } from "@/lib/mobile-portal";
import { isQuizOpen, scorePercent } from "@/lib/quiz";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/parent/quizzes/[id]
 *
 * One quiz. If the child has completed it, returns the full review (their
 * answers, the correct options and explanations). If not yet attempted, returns
 * the questions WITHOUT the correct option so the app can run the quiz — mirror
 * of /portal/quizzes/[id].
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

  const quiz = await db.quiz.findFirst({
    where: { id, status: "PUBLISHED", ...catalogScope(classLevelId) },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      availableFrom: true,
      availableUntil: true,
      timeLimitMinutes: true,
      subject: { select: { name: true } },
      questions: {
        orderBy: { sequence: "asc" },
        select: {
          id: true, sequence: true, prompt: true, options: true, points: true,
          correctOption: true, explanation: true,
        },
      },
      attempts: {
        where: { studentId },
        select: {
          id: true, score: true, totalPoints: true, completedAt: true,
          answers: { select: { questionId: true, selectedOption: true, isCorrect: true, pointsAwarded: true } },
        },
      },
    },
  });

  if (!quiz) return cors(NextResponse.json({ error: "Quiz not found." }, { status: 404 }));

  const attempt = quiz.attempts.find((a) => a.completedAt) ?? null;
  const open = isQuizOpen(quiz);

  if (attempt) {
    // Completed — return the review with correct answers revealed.
    const correct = attempt.answers.filter((a) => a.isCorrect).length;
    return cors(NextResponse.json({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      subject: quiz.subject?.name ?? "",
      state: "completed",
      score: attempt.score,
      totalPoints: attempt.totalPoints,
      percent: scorePercent(attempt.score, attempt.totalPoints),
      correct,
      questionCount: quiz.questions.length,
      passed: scorePercent(attempt.score, attempt.totalPoints) >= 40,
      questions: quiz.questions.map((q) => {
        const given = attempt.answers.find((a) => a.questionId === q.id);
        return {
          id: q.id,
          sequence: q.sequence,
          prompt: q.prompt,
          options: q.options,
          points: q.points,
          correctOption: q.correctOption,
          selectedOption: given?.selectedOption ?? null,
          pointsAwarded: given?.pointsAwarded ?? 0,
          explanation: q.explanation,
        };
      }),
    }));
  }

  // Not attempted — hand the app a runnable quiz, correct option withheld.
  return cors(NextResponse.json({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    subject: quiz.subject?.name ?? "",
    state: open && quiz.questions.length > 0 ? "available" : "closed",
    timeLimitMinutes: quiz.timeLimitMinutes,
    questionCount: quiz.questions.length,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      sequence: q.sequence,
      prompt: q.prompt,
      options: q.options,
      points: q.points,
    })),
  }));
}
