import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  quizId: z.string().min(1),
  prompt: z.string().trim().min(2, "A question is required").max(500),
  options: z.array(z.string().trim().max(200)).min(2).max(4),
  correctOption: z.coerce.number().int().min(0).max(3),
  points: z.coerce.number().int().min(1).max(100),
  explanation: z.string().trim().max(500).optional(),
});

/**
 * POST /api/mobile/v1/admin/quizzes/question — add a multiple-choice question to
 * a quiz. Mirror of the web `addQuestion`: blanks dropped, correct index remapped,
 * options must be at least two and distinct. Gated on quiz.manage.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "quiz.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { quizId, prompt, correctOption, points, explanation } = parsed.data;

  const options: string[] = [];
  let remappedCorrect = -1;
  parsed.data.options.forEach((value, index) => {
    const text = (value ?? "").trim();
    if (text.length === 0) return;
    if (index === correctOption) remappedCorrect = options.length;
    options.push(text);
  });

  if (options.length < 2) {
    return cors(NextResponse.json({ error: "Give at least two options." }, { status: 400 }));
  }
  if (remappedCorrect < 0) {
    return cors(NextResponse.json({ error: "The correct option cannot be a blank choice." }, { status: 400 }));
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return cors(NextResponse.json({ error: "Options must be distinct." }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { id: true } });
  if (!quiz) return cors(NextResponse.json({ error: "Quiz not found." }, { status: 404 }));

  const last = await db.quizQuestion.findFirst({ where: { quizId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  const sequence = (last?.sequence ?? 0) + 1;

  const question = await db.quizQuestion.create({
    data: { quizId, sequence, prompt, options, correctOption: remappedCorrect, points, explanation: explanation || null },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "quiz.question.create", entityType: "QuizQuestion", entityId: question.id,
    after: { quizId, sequence, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Question ${sequence} added.` }));
}
