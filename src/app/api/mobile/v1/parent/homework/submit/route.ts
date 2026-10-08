import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { resolveStudentId } from "@/lib/mobile-portal";
import { saveUpload } from "@/lib/storage";
import {
  ALLOWED_DOCUMENT_TYPES,
  safeFileName,
  sniffDocumentType,
  validateDocumentUpload,
} from "@/lib/uploads";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  submissionId: z.string().min(1).optional(),
  homeworkId: z.string().min(1).optional(),
  // The written answer is optional when a file is attached (a photo of written work).
  content: z.string().trim().max(8000).optional(),
  // An optional attachment: a PDF or image, base64-encoded, up to 10 MB.
  attachment: z
    .object({
      type: z.string().min(1),
      base64: z.string().min(1),
    })
    .optional(),
}).refine((v) => v.submissionId || v.homeworkId, { message: "Missing the homework reference" })
  .refine((v) => (v.content && v.content.length > 0) || v.attachment, {
    message: "Write your answer or attach your work before submitting",
  });

/**
 * POST /api/mobile/v1/parent/homework/submit
 *
 * The signed-in child turns in a written answer and/or a file (a photo of their
 * written work, or a PDF). Updates the student's own ASSIGNED submission row to
 * SUBMITTED (or LATE if past the due date). Only ever touches the child's own
 * row, so a guardian can't submit for anyone else. The attachment is validated
 * by sniffing its bytes and stored via the shared uploads table.
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

  // Validate + store an attachment if one was sent.
  let attachmentUrl: string | undefined;
  if (parsed.data.attachment) {
    const { type, base64 } = parsed.data.attachment;
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(base64, "base64"));
    } catch {
      return cors(NextResponse.json({ error: "That file could not be read." }, { status: 400 }));
    }
    const validation = validateDocumentUpload({ type, size: bytes.byteLength });
    if (!validation.ok) {
      return cors(NextResponse.json({ error: validation.reason ?? "That file cannot be attached." }, { status: 400 }));
    }
    const sniffed = sniffDocumentType(bytes);
    if (!sniffed) {
      return cors(NextResponse.json({ error: "That file is not a readable PDF or image." }, { status: 400 }));
    }
    if (sniffed !== type) {
      return cors(NextResponse.json(
        { error: "That file's contents do not match its type. Re-save it and try again." },
        { status: 400 },
      ));
    }
    const extension = ALLOWED_DOCUMENT_TYPES[sniffed];
    const filename = safeFileName(submission.id, extension);
    attachmentUrl = await saveUpload("homework", filename, bytes, sniffed);
  }

  const now = new Date();
  const late = now > submission.homework.dueOn;
  await db.homeworkSubmission.update({
    where: { id: submission.id },
    data: {
      status: late ? "LATE" : "SUBMITTED",
      content: parsed.data.content ?? null,
      ...(attachmentUrl ? { attachmentUrl } : {}),
      submittedAt: now,
      submittedById: session.userId,
    },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "homework.submit", entityType: "HomeworkSubmission", entityId: submission.id,
    after: { homeworkId: submission.homework.id, late, hasFile: Boolean(attachmentUrl), via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    status: late ? "LATE" : "SUBMITTED",
    attachmentUrl: attachmentUrl ?? null,
    message: late
      ? `Submitted “${submission.homework.title}” (marked late — it was past the due date).`
      : `Submitted “${submission.homework.title}”.`,
  }));
}
