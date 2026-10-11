import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/quizzes/[id]
 *
 * One quiz for the admin/teacher authoring view: status and every question with
 * its options, points, correct answer and explanation. Mirror of the web quiz
 * detail (authoring side — correct answers ARE shown, unlike the student view).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, ["quiz.read", "quiz.manage"], { feature: "lms" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const db = scopedDb(session.schoolId);
  const q = await db.quiz.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, status: true, timeLimitMinutes: true,
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
      questions: {
        orderBy: { sequence: "asc" },
        select: { id: true, sequence: true, prompt: true, options: true, points: true, correctOption: true, explanation: true },
      },
      _count: { select: { attempts: true } },
    },
  });
  if (!q) return cors(NextResponse.json({ error: "Quiz not found." }, { status: 404 }));

  const canManage = guard.permissions.includes("*") ||
    guard.permissions.includes("quiz.manage") || guard.permissions.includes("quiz.*");
  const canPublish = guard.permissions.includes("*") ||
    guard.permissions.includes("quiz.publish") || guard.permissions.includes("quiz.*");

  return cors(NextResponse.json({
    id: q.id,
    title: q.title,
    description: q.description,
    status: q.status,
    subject: q.subject?.name ?? null,
    classLevel: q.classLevel?.name ?? null,
    timeLimitMinutes: q.timeLimitMinutes,
    attempts: q._count.attempts,
    canManage,
    canPublish,
    questions: q.questions.map((qn) => ({
      id: qn.id, sequence: qn.sequence, prompt: qn.prompt, options: qn.options,
      points: toNumber(qn.points), correctOption: qn.correctOption, explanation: qn.explanation,
    })),
  }));
}
