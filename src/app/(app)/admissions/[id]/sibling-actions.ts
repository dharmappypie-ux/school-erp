"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export interface ApplicationSiblingState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const RELATIONS = ["BROTHER", "SISTER", "OTHER"] as const;

const ApplicationSiblingSchema = z.object({
  applicationId: z.string().trim().min(1, "Choose an application"),
  name: z.string().trim().min(1, "Enter the sibling's name").max(120),
  relation: z.enum(RELATIONS, { message: "Choose brother, sister or other" }),
  dateOfBirth: z.string().trim().optional(),
  schoolName: z.string().trim().max(160).optional(),
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * UTC midnight, which is what a `@db.Date` column stores. Local midnight lands
 * on the previous day once Postgres casts it for anyone east of UTC.
 */
function parseDateOfBirth(
  value: string | undefined,
): { ok: true; value: Date | null } | { ok: false; message: string } {
  if (!value) return { ok: true, value: null };
  if (!DATE_ONLY.test(value)) return { ok: false, message: "Enter a valid date" };

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: "Enter a valid date" };
  }

  // A day of grace: an office in IST entering today's date before 05:30 local
  // is still on yesterday in UTC, and a strict comparison would reject it.
  const now = new Date();
  const latestAllowed = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  if (date > latestAllowed) {
    return { ok: false, message: "A date of birth cannot be in the future" };
  }
  return { ok: true, value: date };
}

/**
 * Records a sibling the family listed on an admission application.
 *
 * The row carries `applicationId` and no `studentId` until enrolment moves it
 * across (see `enrolApplicant`), so it belongs to the applicant for as long as
 * the applicant is all there is.
 */
export async function addApplicationSibling(
  _previous: ApplicationSiblingState,
  formData: FormData,
): Promise<ApplicationSiblingState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)]),
  );

  const parsed = ApplicationSiblingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      // The first complaint about a field explains it; later ones are knock-on.
      if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
    }
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors,
      values: raw,
    };
  }

  const session = await requirePermission("admissions.manage");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;

  const application = await db.admissionApplication.findFirst({
    where: { id: input.applicationId },
    select: { id: true, studentId: true },
  });
  if (!application) {
    return {
      ok: false,
      message: "That application is no longer on file.",
      values: raw,
    };
  }
  // Siblings only ride across to the student at the moment of enrolment, so one
  // added afterwards would sit on the application for ever.
  if (application.studentId) {
    return {
      ok: false,
      message:
        "This applicant is already enrolled — add siblings on the student record instead.",
      values: raw,
    };
  }

  const dateOfBirth = parseDateOfBirth(input.dateOfBirth);
  if (!dateOfBirth.ok) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: { dateOfBirth: dateOfBirth.message },
      values: raw,
    };
  }

  const sibling = await db.studentSibling.create({
    data: {
      schoolId: session.schoolId,
      applicationId: application.id,
      name: input.name,
      relation: input.relation,
      dateOfBirth: dateOfBirth.value,
      schoolName: input.schoolName || null,
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "admissions.sibling.add",
    entityType: "StudentSibling",
    entityId: sibling.id,
    after: {
      applicationId: application.id,
      name: input.name,
      relation: input.relation,
    },
  });

  revalidatePath(`/admissions/${application.id}`);

  return { ok: true, message: `${input.name} added.` };
}

/** Removes a sibling from an application outright — it is what a parent said, not a ledger. */
export async function removeApplicationSibling(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  if (!id || !applicationId) return;

  const session = await requirePermission("admissions.manage");
  const db = scopedDb(session.schoolId);

  const existing = await db.studentSibling.findFirst({
    where: { id, applicationId },
    select: { id: true, name: true, relation: true, studentId: true },
  });
  // Once enrolment has moved the row onto a student it is the student's
  // record, and removing it belongs on the student page.
  if (!existing || existing.studentId) return;

  await db.studentSibling.delete({ where: { id: existing.id } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "admissions.sibling.remove",
    entityType: "StudentSibling",
    entityId: existing.id,
    before: {
      applicationId,
      name: existing.name,
      relation: existing.relation,
    },
  });

  revalidatePath(`/admissions/${applicationId}`);
}
