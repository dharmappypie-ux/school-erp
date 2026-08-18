"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";
import {
  ALLOWED_DOCUMENT_TYPES,
  safeFileName,
  sniffDocumentType,
  validateDocumentUpload,
} from "@/lib/uploads";

export interface AttachResult {
  ok: boolean;
  message: string;
  url?: string;
}

const DIRECTORY = "homework";

/**
 * Writes an uploaded worksheet and returns its public URL.
 *
 * Shared by the teacher attaching a worksheet and the student attaching their
 * work, so the checks — declared type, sniffed bytes, size, generated filename
 * — cannot drift apart between the two paths.
 */
async function storeUpload(
  file: File,
  recordId: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const validation = validateDocumentUpload({ type: file.type, size: file.size });
  if (!validation.ok) {
    return { ok: false, message: validation.reason ?? "That file cannot be attached." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffDocumentType(bytes);

  if (!sniffed) {
    return { ok: false, message: "That file is not a readable PDF or image." };
  }
  if (sniffed !== file.type) {
    // The extension says one thing and the bytes say another — refuse rather
    // than trust the label the browser sent.
    return {
      ok: false,
      message: "That file's contents do not match its type. Re-save it and try again.",
    };
  }

  const extension = ALLOWED_DOCUMENT_TYPES[sniffed];
  const filename = safeFileName(recordId, extension);
  const directory = path.join(process.cwd(), "public", "uploads", DIRECTORY);

  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), bytes);

  return { ok: true, url: `/uploads/${DIRECTORY}/${filename}` };
}

/** Attaches a worksheet to an assignment. Teacher side. */
export async function attachWorksheet(
  homeworkId: string,
  formData: FormData,
): Promise<AttachResult> {
  const session = await requirePermission("homework.manage");

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Choose a file first." };

  const db = scopedDb(session.schoolId);
  const homework = await db.homework.findUnique({
    where: { id: homeworkId },
    select: { id: true },
  });
  if (!homework) return { ok: false, message: "Assignment not found in your school." };

  const stored = await storeUpload(file, homework.id);
  if (!stored.ok) return { ok: false, message: stored.message };

  await db.homework.update({
    where: { id: homework.id },
    data: { attachmentUrl: stored.url },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "homework.attach",
    entityType: "Homework",
    entityId: homework.id,
    after: { attachmentUrl: stored.url },
  });

  return { ok: true, message: "Worksheet attached.", url: stored.url };
}

/** Attaches a file to a submission. Student or guardian side. */
export async function attachSubmissionFile(
  submissionId: string,
  childId: string | undefined,
  formData: FormData,
): Promise<AttachResult> {
  const { context, child } = await resolvePortalStudent(childId);
  const session = context.session;

  if (!hasPermission(session.permissions, "homework.submit")) {
    return { ok: false, message: "Your account cannot submit homework." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Choose a file first." };

  const db = scopedDb(session.schoolId);

  // tenant-safe: the submission must belong to the child this viewer is
  // entitled to, resolved from their own relationships within this school.
  const submission = await db.homeworkSubmission.findFirst({
    where: { id: submissionId, studentId: child.id },
    select: { id: true, status: true },
  });
  if (!submission) return { ok: false, message: "That assignment is not on your list." };
  if (submission.status === "GRADED") {
    return { ok: false, message: "This has already been marked." };
  }

  const stored = await storeUpload(file, submission.id);
  if (!stored.ok) return { ok: false, message: stored.message };

  // tenant-safe: `submission` was resolved above against this child.
  await db.homeworkSubmission.update({
    where: { id: submission.id },
    data: { attachmentUrl: stored.url },
  });

  return { ok: true, message: "File attached.", url: stored.url };
}
