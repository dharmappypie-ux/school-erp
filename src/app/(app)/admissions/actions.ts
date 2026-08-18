"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { canTransition, nextAdmissionNumber, STATUS_LABEL } from "@/lib/admissions";
import { hashPassword } from "@/lib/password";
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

/**
 * Converts an accepted application into a real student.
 *
 * Creates the student, a guardian, the link between them, portal logins for
 * both, and the enrolment — all inside one transaction, so a half-created
 * child can never exist. The application is marked ENROLLED and linked to the
 * new record.
 */
export async function enrolApplicant(
  input: z.infer<typeof EnrolSchema>,
): Promise<ActionResult> {
  const parsed = EnrolSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("admissions.manage");
  const db = scopedDb(session.schoolId);
  const { applicationId, sectionId } = parsed.data;

  if (!session.academicYear) {
    return { ok: false, message: "No academic year is marked current." };
  }
  const academicYearId = session.academicYear.id;

  const application = await db.admissionApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) {
    return { ok: false, message: "Application not found in your school." };
  }
  if (application.status === "ENROLLED" || application.studentId) {
    return { ok: false, message: "This applicant is already enrolled." };
  }
  if (application.status !== "ACCEPTED") {
    return {
      ok: false,
      message: `Only accepted applications can be enrolled. This one is ${STATUS_LABEL[application.status].toLowerCase()}.`,
    };
  }

  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: {
      id: true, name: true, capacity: true, classLevelId: true, academicYearId: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });
  if (!section || section.academicYearId !== academicYearId) {
    return { ok: false, message: "That section is not part of the current year." };
  }
  if (section.classLevelId !== application.classLevelId) {
    return {
      ok: false,
      message: "The chosen section belongs to a different class than the application.",
    };
  }
  if (section._count.enrollments >= section.capacity) {
    return {
      ok: false,
      message: `${section.classLevel.name} ${section.name} is full (${section.capacity} seats).`,
    };
  }

  // Admission numbers follow the school's own code (e.g. GIS2026…) so numbers
  // issued here match those already in use; the slug is only a fallback.
  const school = await db.school.findUnique({
    where: { id: session.schoolId },
    select: { code: true },
  });
  const prefix = `${(school?.code || session.school.slug.slice(0, 3)).toUpperCase()}${new Date().getFullYear()}`;
  const latest = await db.student.findFirst({
    where: { admissionNo: { startsWith: prefix } },
    orderBy: { admissionNo: "desc" },
    select: { admissionNo: true },
  });
  const admissionNo = nextAdmissionNumber(prefix, latest?.admissionNo ?? null);

  const [studentRoleId, parentRoleId] = await Promise.all([
    db.role.findUnique({
      where: { schoolId_key: { schoolId: session.schoolId, key: "STUDENT" } },
      select: { id: true },
    }),
    db.role.findUnique({
      where: { schoolId_key: { schoolId: session.schoolId, key: "PARENT" } },
      select: { id: true },
    }),
  ]);

  // A shared temporary password, flagged so both accounts must change it on
  // first sign-in.
  const temporaryPassword = `${admissionNo}@${new Date().getFullYear()}`;
  const passwordHash = await hashPassword(temporaryPassword);
  const studentEmail =
    application.guardianEmail
      ? `${admissionNo.toLowerCase()}@${session.school.slug}.edu.in`
      : `${admissionNo.toLowerCase()}@${session.school.slug}.local`;
  const guardianEmail =
    application.guardianEmail ?? `parent.${admissionNo.toLowerCase()}@${session.school.slug}.local`;

  const rollNumber = String(section._count.enrollments + 1);

  try {
    await db.$transaction(async (tx) => {
      const studentUser = await tx.user.create({
        data: {
          schoolId: session.schoolId,
          email: studentEmail,
          firstName: application.firstName,
          lastName: application.lastName,
          passwordHash,
          mustChangePassword: true,
          status: "ACTIVE",
          ...(studentRoleId ? { roles: { connect: [{ id: studentRoleId.id }] } } : {}),
        },
      });

      const student = await tx.student.create({
        data: {
          schoolId: session.schoolId,
          userId: studentUser.id,
          admissionNo,
          rollNumber,
          firstName: application.firstName,
          middleName: application.middleName,
          lastName: application.lastName,
          dateOfBirth: application.dateOfBirth,
          gender: application.gender,
          email: studentEmail,
          photoUrl: application.photoUrl,
          addressLine1: application.addressLine1,
          city: application.city,
          state: application.state,
          postalCode: application.postalCode,
          previousSchool: application.previousSchool,
          admissionDate: new Date(),
          status: "ACTIVE",
        },
      });

      const guardianUser = await tx.user.create({
        data: {
          schoolId: session.schoolId,
          email: guardianEmail,
          firstName: application.guardianName.split(" ")[0] ?? application.guardianName,
          lastName: application.guardianName.split(" ").slice(1).join(" ") || null,
          phone: application.guardianPhone,
          passwordHash,
          mustChangePassword: true,
          status: "ACTIVE",
          ...(parentRoleId ? { roles: { connect: [{ id: parentRoleId.id }] } } : {}),
        },
      });

      const guardian = await tx.guardian.create({
        data: {
          schoolId: session.schoolId,
          userId: guardianUser.id,
          firstName: application.guardianName.split(" ")[0] ?? application.guardianName,
          lastName: application.guardianName.split(" ").slice(1).join(" ") || null,
          email: application.guardianEmail,
          phone: application.guardianPhone,
          city: application.city,
          state: application.state,
        },
      });

      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.id,
          relationship: application.relationship ?? "GUARDIAN",
          isPrimary: true,
          isFeePayer: true,
        },
      });

      await tx.enrollment.create({
        data: {
          schoolId: session.schoolId,
          studentId: student.id,
          sectionId,
          academicYearId,
          rollNumber,
          isActive: true,
        },
      });

      await tx.admissionApplication.update({
        where: { id: applicationId },
        data: { status: "ENROLLED", studentId: student.id },
      });

      await tx.admissionEvent.create({
        data: {
          applicationId,
          fromStatus: application.status,
          toStatus: "ENROLLED",
          note: `Enrolled as ${admissionNo} in ${section.classLevel.name} ${section.name}.`,
          actorId: session.userId,
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: message.includes("Unique constraint")
        ? "A student or login with those details already exists. Nothing was created."
        : `Enrolment failed and was rolled back: ${message}`,
    };
  }

  await queueNotification({
    schoolId: session.schoolId,
    channel: "EMAIL",
    recipient: application.guardianEmail ?? application.guardianPhone,
    subject: `Welcome to ${session.school.name}`,
    body: `Dear Parent, ${application.firstName} has been enrolled in ${section.classLevel.name} ${section.name} with admission number ${admissionNo}. Portal sign-in: ${guardianEmail}, temporary password ${temporaryPassword} — you will be asked to change it on first sign-in.`,
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "admissions.enrol",
    entityType: "AdmissionApplication",
    entityId: applicationId,
    after: { admissionNo, sectionId, rollNumber },
  });

  revalidatePath("/admissions");
  revalidatePath(`/admissions/${applicationId}`);
  revalidatePath("/students");

  return {
    ok: true,
    message: `Enrolled as ${admissionNo} in ${section.classLevel.name} ${section.name}. Portal logins created; temporary password ${temporaryPassword}.`,
  };
}
