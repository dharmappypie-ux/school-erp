import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb, type ScopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  submissionId: z.string().min(1).optional(),
  homeworkId: z.string().min(1).optional(),
  content: z.string().trim().min(1, "Write your answer before submitting").max(8000),
}).refine((v) => v.submissionId || v.homeworkId, { message: "Missing the homework reference" });

async function resolveStudentId(db: ScopedDb, studentId: string | null, guardianId: string | null) {
  if (studentId) return studentId;
  if (!guardianId) return null;
  const link = await db.studentGuardian.findFirst({ where: { guardianId }, select: { studentId: true } });
  return link?.studentId ?? null;
}

/**
 * POST /api/mobile/v1/parent/homework/submit
 *
 * The signed-in child turns in a written answer. Updates the student's own
 * ASSIGNED submission row to SUBMITTED (or LATE if past the due date). Only ever
 * touches the child's own row, so a guardian can't submit for anyone else.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const studentId = await resolveStudentId(db, session.studentId, session.guardianId);
  if (!studentId) return cors(NextResponse.json({ error: "No student is linked to this account." }, { status: 404 }));

  const submission = await db.homeworkSubmission.findFirst({
    where: {
      studentId,
      ...(parsed.data.submissionId ? { id: parsed.data.submissionId } : { homeworkId: parsed.data.homeworkId }),
    },
    select: { id: true, status: true, homework: { select: { id: true, title: true, dueOn: true } } },
  });
  if (!submission) {
    return cors(NextResponse.json({ error: "That homework isn't assigned to this student." }, { status: 404 }));
  }
  if (submission.status === "GRADED") {
    return cors(NextResponse.json({ error: "This homework has already been graded." }, { status: 409 }));
  }

  const now = new Date();
  const late = now > submission.homework.dueOn;
  await db.homeworkSubmission.update({
    where: { id: submission.id },
    data: {
      status: late ? "LATE" : "SUBMITTED",
      content: parsed.data.content,
      submittedAt: now,
      submittedById: session.userId,
    },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "homework.submit", entityType: "HomeworkSubmission", entityId: submission.id,
    after: { homeworkId: submission.homework.id, late, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    status: late ? "LATE" : "SUBMITTED",
    message: late
      ? `Submitted “${submission.homework.title}” (marked late — it was past the due date).`
      : `Submitted “${submission.homework.title}”.`,
  }));
}
