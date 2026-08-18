"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { scopedDb } from "@/lib/tenant";
import {
  safeImageName,
  sniffImageType,
  validateImageUpload,
} from "@/lib/uploads";

export type PhotoSubject = "student" | "staff";

export interface PhotoResult {
  ok: boolean;
  message: string;
  photoUrl?: string | null;
}

/**
 * Per-subject configuration. Keeping students and staff on one code path means
 * the security checks below cannot drift apart between them.
 */
const SUBJECTS = {
  student: {
    directory: "students",
    permission: "students.update",
    entityType: "Student",
    label: "Student",
  },
  staff: {
    directory: "staff",
    permission: "staff.update",
    entityType: "StaffMember",
    label: "Staff member",
  },
} as const;

function uploadDir(subject: PhotoSubject): string {
  return join(process.cwd(), "public", "uploads", SUBJECTS[subject].directory);
}

function publicPath(subject: PhotoSubject, filename: string): string {
  return `/uploads/${SUBJECTS[subject].directory}/${filename}`;
}

/** Reads the record and its current photo, scoped to the caller's school. */
async function loadRecord(
  subject: PhotoSubject,
  schoolId: string,
  id: string,
): Promise<{ id: string; photoUrl: string | null } | null> {
  const db = scopedDb(schoolId);
  if (subject === "student") {
    return db.student.findUnique({
      where: { id },
      select: { id: true, photoUrl: true },
    });
  }
  return db.staffMember.findUnique({
    where: { id },
    select: { id: true, photoUrl: true },
  });
}

async function savePhotoUrl(
  subject: PhotoSubject,
  schoolId: string,
  id: string,
  photoUrl: string | null,
): Promise<void> {
  const db = scopedDb(schoolId);
  if (subject === "student") {
    await db.student.update({ where: { id }, data: { photoUrl } });
    return;
  }
  await db.staffMember.update({ where: { id }, data: { photoUrl } });
}

/** Deletes a previously stored file, ignoring anything not written by us. */
async function removeStoredFile(
  subject: PhotoSubject,
  photoUrl: string | null,
  keep?: string,
): Promise<void> {
  const prefix = `/uploads/${SUBJECTS[subject].directory}/`;
  if (!photoUrl?.startsWith(prefix)) return;
  const filename = photoUrl.slice(prefix.length);
  if (!filename || filename === keep || filename.includes("/")) return;
  await unlink(join(uploadDir(subject), filename)).catch(() => undefined);
}

/**
 * Stores a person's photo.
 *
 * Files are written to `public/uploads` on the local filesystem, which works on
 * a VPS or a container with a persistent volume. A serverless deployment needs
 * object storage instead, and this is the one function to swap.
 *
 * The declared MIME type is never trusted — the leading bytes decide — and the
 * filename is built from the record id plus a server-chosen extension, so the
 * uploader cannot influence where the file lands.
 */
export async function uploadPersonPhoto(
  subject: PhotoSubject,
  recordId: string,
  formData: FormData,
): Promise<PhotoResult> {
  const config = SUBJECTS[subject];
  const session = await requirePermission(config.permission);

  const record = await loadRecord(subject, session.schoolId, recordId);
  if (!record) {
    return { ok: false, message: `${config.label} not found in your school.` };
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return { ok: false, message: "No image was received." };
  }

  const declared = validateImageUpload({ type: file.type, size: file.size });
  if (!declared.ok) return { ok: false, message: declared.reason! };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const actualType = sniffImageType(bytes);
  if (!actualType) {
    return {
      ok: false,
      message: "That file is not a JPEG, PNG or WebP image, whatever its name says.",
    };
  }
  if (actualType !== file.type) {
    return {
      ok: false,
      message: `The file claims to be ${file.type} but its contents are ${actualType}.`,
    };
  }

  const filename = safeImageName(record.id, declared.extension!);

  try {
    await mkdir(uploadDir(subject), { recursive: true });
    await writeFile(join(uploadDir(subject), filename), bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Could not save the image: ${message}` };
  }

  const photoUrl = publicPath(subject, filename);
  await savePhotoUrl(subject, session.schoolId, recordId, photoUrl);

  // Replaced photos would otherwise accumulate on disk. A failure here is not
  // worth surfacing — the new photo is already live.
  await removeStoredFile(subject, record.photoUrl, filename);

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: `${subject}.photo.update`,
    entityType: config.entityType,
    entityId: recordId,
    after: { photoUrl },
  });

  revalidatePath(`/${subject === "student" ? "students" : "staff"}/${recordId}`);
  revalidatePath(subject === "student" ? "/students" : "/staff");

  return { ok: true, message: "Photo updated.", photoUrl };
}

/** Removes a person's photo and the file behind it. */
export async function removePersonPhoto(
  subject: PhotoSubject,
  recordId: string,
): Promise<PhotoResult> {
  const config = SUBJECTS[subject];
  const session = await requirePermission(config.permission);

  const record = await loadRecord(subject, session.schoolId, recordId);
  if (!record) {
    return { ok: false, message: `${config.label} not found in your school.` };
  }
  if (!record.photoUrl) {
    return { ok: false, message: "There is no photo to remove." };
  }

  await savePhotoUrl(subject, session.schoolId, recordId, null);
  await removeStoredFile(subject, record.photoUrl);

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: `${subject}.photo.remove`,
    entityType: config.entityType,
    entityId: recordId,
  });

  revalidatePath(`/${subject === "student" ? "students" : "staff"}/${recordId}`);
  revalidatePath(subject === "student" ? "/students" : "/staff");

  return { ok: true, message: "Photo removed.", photoUrl: null };
}
