"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import {
  commitStudentImport,
  gridFromUpload,
  previewStudentImport,
  type ImportState,
} from "@/lib/import-run";
import { type ParsedStudent } from "@/lib/student-import";

export type { ImportState } from "@/lib/import-run";

/**
 * Student bulk import — the web console's half.
 *
 * The rules live in `@/lib/import-run`, which the mobile app's import screen
 * calls too; these read the form and revalidate.
 */

export async function previewImport(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requirePermission("students.create");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file to upload." };
  }

  const read = await gridFromUpload(file);
  if ("error" in read) return { ok: false, message: read.error };

  return previewStudentImport(session.schoolId, session.academicYear?.id, read.grid);
}

export async function commitImport(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requirePermission("students.create");
  const payload = String(formData.get("payload") ?? "");

  let rows: ParsedStudent[];
  try {
    const decoded: unknown = JSON.parse(payload);
    if (!Array.isArray(decoded) || decoded.length === 0) {
      return { ok: false, message: "Nothing to import. Upload the file again." };
    }
    rows = decoded as ParsedStudent[];
  } catch {
    return { ok: false, message: "That import could not be read. Upload the file again." };
  }

  const result = await commitStudentImport(
    {
      schoolId: session.schoolId,
      userId: session.userId,
      yearId: session.academicYear?.id,
      plan: session.school.plan,
    },
    rows,
  );

  if (result.ok) revalidatePath("/students");
  return result;
}
