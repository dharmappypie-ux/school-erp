import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  quizId: z.string().min(1),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});

/** POST /api/mobile/v1/admin/quizzes/status — publish/archive/revert, like the web. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, ["quiz.publish", "quiz.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { quizId, status } = parsed.data;

  const db = scopedDb(session.schoolId);
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, title: true, status: true, _count: { select: { questions: true } } },
  });
  if (!quiz) return cors(NextResponse.json({ error: "Quiz not found in your school." }, { status: 404 }));
  if (status === "PUBLISHED" && quiz._count.questions === 0) {
    return cors(NextResponse.json({ error: "Add at least one question before publishing." }, { status: 409 }));
  }

  await db.quiz.update({
    where: { id: quizId },
    data: { status, publishedAt: status === "PUBLISHED" ? new Date() : null },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "quiz.status", entityType: "Quiz", entityId: quizId,
    before: { status: quiz.status }, after: { status, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `“${quiz.title}” ${status.toLowerCase()}.` }));
}
