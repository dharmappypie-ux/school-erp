import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/quizzes — quizzes with status + question count. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["quiz.manage", "quiz.publish", "quiz.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.quiz.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, title: true, status: true,
      subject: { select: { name: true } },
      _count: { select: { questions: true } },
    },
  });

  return cors(NextResponse.json({
    items: rows.map((q) => ({
      id: q.id, title: q.title, status: q.status,
      subject: q.subject?.name ?? "General", questions: q._count.questions,
    })),
  }));
}

const Schema = z.object({
  title: z.string().trim().min(2, "A quiz title is required").max(120),
  description: z.string().trim().max(1000).optional(),
  subjectId: z.string().trim().optional(),
});

/** POST /api/mobile/v1/admin/quizzes — create a draft quiz. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "quiz.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  if (parsed.data.subjectId) {
    const subject = await db.subject.findUnique({ where: { id: parsed.data.subjectId }, select: { id: true } });
    if (!subject) return cors(NextResponse.json({ error: "That subject is not in your school." }, { status: 404 }));
  }

  const quiz = await db.quiz.create({
    data: {
      schoolId: session.schoolId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      subjectId: parsed.data.subjectId || null,
      teacherId: session.staffId ?? null,
      status: "DRAFT",
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "quiz.create", entityType: "Quiz", entityId: quiz.id,
    after: { title: quiz.title, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, id: quiz.id, message: `“${quiz.title}” created as a draft. Add questions on the web, then publish.` }));
}
