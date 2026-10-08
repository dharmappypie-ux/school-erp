import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { catalogScope, classLevelIdForStudent, resolveStudentId } from "@/lib/mobile-portal";
import { isQuizOpen, scorePercent } from "@/lib/quiz";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/parent/quizzes
 *
 * Published quizzes for the child's class, each tagged available / completed /
 * closed with the child's score when taken — the mobile mirror of /portal/quizzes.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const studentId = await resolveStudentId(db, session.studentId, session.guardianId);
  if (!studentId) return cors(NextResponse.json({ items: [], points: 0 }));

  const classLevelId = await classLevelIdForStudent(db, studentId, session.academicYearId);

  const quizzes = await db.quiz.findMany({
    where: { status: "PUBLISHED", ...catalogScope(classLevelId) },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      availableFrom: true,
      availableUntil: true,
      timeLimitMinutes: true,
      subject: { select: { name: true } },
      _count: { select: { questions: true } },
      attempts: {
        where: { studentId },
        select: { id: true, score: true, totalPoints: true, completedAt: true },
      },
    },
  });

  let points = 0;
  const items = quizzes.map((q) => {
    const attempt = q.attempts.find((a) => a.completedAt) ?? null;
    if (attempt) points += attempt.score;
    const open = isQuizOpen(q);
    const status = attempt ? "completed" : open && q._count.questions > 0 ? "available" : "closed";
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      subject: q.subject?.name ?? "",
      questions: q._count.questions,
      timeLimitMinutes: q.timeLimitMinutes,
      status,
      score: attempt?.score ?? null,
      totalPoints: attempt?.totalPoints ?? null,
      percent: attempt ? scorePercent(attempt.score, attempt.totalPoints) : null,
    };
  });

  return cors(NextResponse.json({ items, points }));
}
