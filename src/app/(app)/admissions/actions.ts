"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { canTransition, STATUS_LABEL } from "@/lib/admissions";
import { enrolApplicant as enrolApplicantToSection } from "@/lib/admissions-enrol";
import { queueNotification } from "@/lib/notifications";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const STATUSES = [
  "DRAFT", "SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "TEST_SCHEDULED",
  "INTERVIEW_SCHEDULED", "OFFERED", "ACCEPTED", "REJECTED", "WITHDRAWN", "ENROLLED",
] as const;

const MoveSchema = z.object({
  applicationId: z.string().min(1),
  toStatus: z.enum(STATUSES),
  note: z.string().trim().max(500).optional(),
});

/**
 * Moves an application to the next stage, recording the transition.
 * Rejects any jump the funnel does not allow.
 */
export async function moveApplication(
  input: z.infer<typeof MoveSchema>,
): Promise<ActionResult> {
  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("admissions.manage");
  const db = scopedDb(session.schoolId);
  const { applicationId, toStatus, note } = parsed.data;

  const application = await db.admissionApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, status: true, firstName: true, lastName: true,
      guardianEmail: true, guardianPhone: true, applicationNo: true,
    },
  });
  if (!application) {
    return { ok: false, message: "Application not found in your school." };
  }

  if (toStatus === "ENROLLED") {
    return {
      ok: false,
      message: "Use “Enrol as student” — enrolment has to create the student record.",
    };
  }

  if (!canTransition(application.status, toStatus)) {
    return {
      ok: false,
      message: `Cannot move from ${STATUS_LABEL[application.status]} to ${STATUS_LABEL[toStatus]}.`,
    };
  }

  const decided = ["OFFERED", "ACCEPTED", "REJECTED"].includes(toStatus);

  await db.$transaction([
    db.admissionApplication.update({
      where: { id: applicationId },
      data: {
        status: toStatus,
        ...(decided ? { decisionDate: new Date(), decisionBy: session.userId } : {}),
        ...(toStatus === "REJECTED" && note ? { rejectionReason: note } : {}),
      },
    }),
    // tenant-safe: applicationId comes from a scoped admissionApplication lookup above.
    db.admissionEvent.create({
      data: {
        applicationId,
        fromStatus: application.status,
        toStatus,
        note: note || null,
        actorId: session.userId,
      },
    }),
  ]);

  // Tell the family when a decision is made; earlier internal stages are not
  // worth a notification.
  if (toStatus === "OFFERED" || toStatus === "REJECTED") {
    await queueNotification({
      schoolId: session.schoolId,
      channel: "EMAIL",
      recipient: application.guardianEmail ?? application.guardianPhone,
      subject: `Application ${application.applicationNo} — ${STATUS_LABEL[toStatus]}`,
      body:
        toStatus === "OFFERED"
          ? `Dear Parent, we are pleased to offer a place to ${application.firstName} ${application.lastName ?? ""} at ${session.school.name}. Please contact the office to confirm.`
          : `Dear Parent, thank you for your interest in ${session.school.name}. We are unable to offer a place to ${application.firstName} ${application.lastName ?? ""} at this time.${note ? ` Reason: ${note}` : ""}`,
    });
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "admissions.move",
    entityType: "AdmissionApplication",
    entityId: applicationId,
    before: { status: application.status },
    after: { status: toStatus, note },
  });

  revalidatePath("/admissions");
  revalidatePath(`/admissions/${applicationId}`);

  return { ok: true, message: `Moved to ${STATUS_LABEL[toStatus]}.` };
}

const EnrolSchema = z.object({
  applicationId: z.string().min(1),
  sectionId: z.string().min(1, "Choose a section"),
});

export async function enrolApplicant(
  input: z.infer<typeof EnrolSchema>,
): Promise<ActionResult> {
  const parsed = EnrolSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("admissions.manage");
  if (!session.academicYear) {
    return { ok: false, message: "No academic year is marked current." };
  }
  const db = scopedDb(session.schoolId);

  const result = await enrolApplicantToSection({
    db,
    schoolId: session.schoolId,
    schoolName: session.school.name,
    schoolSlug: session.school.slug,
    academicYearId: session.academicYear.id,
    actorUserId: session.userId,
    applicationId: parsed.data.applicationId,
    sectionId: parsed.data.sectionId,
    plan: session.school.plan,
  });

  if (result.ok) {
    revalidatePath("/admissions");
    revalidatePath(`/admissions/${parsed.data.applicationId}`);
    revalidatePath("/students");
  }
  return { ok: result.ok, message: result.message };
}
