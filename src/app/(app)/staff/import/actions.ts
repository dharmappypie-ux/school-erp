"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { gridFromUpload } from "@/lib/import-run";
import {
  commitStaffRun,
  previewStaffRun,
  type StaffImportState,
} from "@/lib/staff-import-run";

export type { StaffImportState } from "@/lib/staff-import-run";

/**
 * Staff bulk import — the web console's half.
 *
 * The rules live in `@/lib/staff-import-run`, which the mobile app's import
 * screen calls too; these read the form and revalidate.
 */

export async function previewStaffImport(
  _previous: StaffImportState,
  formData: FormData,
): Promise<StaffImportState> {
  const session = await requirePermission("staff.create");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV or Excel file to upload." };
  }

  const read = await gridFromUpload(file);
  if ("error" in read) return { ok: false, message: read.error };

  return previewStaffRun(session.schoolId, session.permissions, read.grid);
}

export async function commitStaffImport(
  _previous: StaffImportState,
  formData: FormData,
): Promise<StaffImportState> {
  const session = await requirePermission("staff.create");

  let decoded: unknown;
  try {
    decoded = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, message: "That import could not be read. Upload the file again." };
  }

  const result = await commitStaffRun(
    {
      schoolId: session.schoolId,
      userId: session.userId,
      permissions: session.permissions,
    },
    decoded,
  );

  if (result.ok) revalidatePath("/staff");
  return result;
}
