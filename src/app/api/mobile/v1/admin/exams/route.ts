import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  termId: z.string().min(1, "Choose a term"),
  classLevelId: z.string().min(1, "Choose a class"),
  subjectId: z.string().min(1, "Choose a subject"),
  name: z.string().trim().min(1, "An exam name is required").max(60),
  maxMarks: z.coerce.number().min(1, "Max marks must be at least 1").max(1000),
  passMarks: z.coerce.number().min(0).max(1000),
}).refine((d) => d.passMarks <= d.maxMarks, { message: "Pass marks cannot exceed the maximum", path: ["passMarks"] });

/**
 * POST /api/mobile/v1/admin/exams — create an exam paper for a term × class ×
 * subject. Mirror of the web `createExam`. Gated on exams.manage.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "exams.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { termId, classLevelId, subjectId, name, maxMarks, passMarks } = parsed.data;

  const db = scopedDb(session.schoolId);
  const [term, classLevel, subject] = await Promise.all([
    db.examTerm.findUnique({ where: { id: termId }, select: { id: true, name: true } }),
    db.classLevel.findUnique({ where: { id: classLevelId }, select: { id: true, name: true } }),
    db.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } }),
  ]);
  if (!term || !classLevel || !subject) {
    return cors(NextResponse.json({ error: "That term, class or subject does not exist in your school." }, { status: 404 }));
  }

  const clash = await db.exam.findFirst({
    where: { termId: term.id, classLevelId: classLevel.id, subjectId: subject.id, name },
    select: { id: true },
  });
  if (clash) {
    return cors(NextResponse.json(
      { error: `${subject.name} "${name}" already exists for ${classLevel.name} in ${term.name}.` },
      { status: 409 },
    ));
  }

  const exam = await db.exam.create({
    data: { schoolId: session.schoolId, termId: term.id, classLevelId: classLevel.id, subjectId: subject.id, name, maxMarks, passMarks },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "exams.create", entityType: "Exam", entityId: exam.id,
    after: { term: term.name, classLevel: classLevel.name, subject: subject.name, name: exam.name, maxMarks, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `${subject.name} "${exam.name}" added for ${classLevel.name} in ${term.name}.`,
  }));
}
