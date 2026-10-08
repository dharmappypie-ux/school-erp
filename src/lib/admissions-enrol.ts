import { nextAdmissionNumber, STATUS_LABEL } from "@/lib/admissions";
import { recordAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notifications";
import { hashPassword } from "@/lib/password";
import type { ScopedDb } from "@/lib/tenant";

export interface EnrolInput {
  db: ScopedDb;
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  academicYearId: string;
  actorUserId: string;
  applicationId: string;
  sectionId: string;
}

export interface EnrolResult {
  ok: boolean;
  message: string;
  studentId?: string;
  admissionNo?: string;
}

/**
 * Enrols an ACCEPTED admission applicant into a section: creates the student +
 * guardian logins, the StudentGuardian link and the active Enrollment, and marks
 * the application ENROLLED. Shared verbatim by the web `enrolApplicant` server
 * action and the mobile admin endpoint so the two can never drift.
 */
export async function enrolApplicant(input: EnrolInput): Promise<EnrolResult> {
  const { db, schoolId, schoolName, schoolSlug, academicYearId, actorUserId, applicationId, sectionId } = input;

  const application = await db.admissionApplication.findUnique({ where: { id: applicationId } });
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
    return { ok: false, message: "The chosen section belongs to a different class than the application." };
  }
  if (section._count.enrollments >= section.capacity) {
    return { ok: false, message: `${section.classLevel.name} ${section.name} is full (${section.capacity} seats).` };
  }

  const school = await db.school.findUnique({ where: { id: schoolId }, select: { code: true } });
  const prefix = `${(school?.code || schoolSlug.slice(0, 3)).toUpperCase()}${new Date().getFullYear()}`;
  const latest = await db.student.findFirst({
    where: { admissionNo: { startsWith: prefix } },
    orderBy: { admissionNo: "desc" },
    select: { admissionNo: true },
  });
  const admissionNo = nextAdmissionNumber(prefix, latest?.admissionNo ?? null);

  const [studentRoleId, parentRoleId] = await Promise.all([
    db.role.findUnique({ where: { schoolId_key: { schoolId, key: "STUDENT" } }, select: { id: true } }),
    db.role.findUnique({ where: { schoolId_key: { schoolId, key: "PARENT" } }, select: { id: true } }),
  ]);

  const temporaryPassword = `${admissionNo}@${new Date().getFullYear()}`;
  const passwordHash = await hashPassword(temporaryPassword);
  const studentEmail = application.guardianEmail
    ? `${admissionNo.toLowerCase()}@${schoolSlug}.edu.in`
    : `${admissionNo.toLowerCase()}@${schoolSlug}.local`;
  const guardianEmail = application.guardianEmail ?? `parent.${admissionNo.toLowerCase()}@${schoolSlug}.local`;
  const rollNumber = String(section._count.enrollments + 1);

  let newStudentId = "";
  try {
    await db.$transaction(async (tx) => {
      const studentUser = await tx.user.create({
        data: {
          schoolId, email: studentEmail,
          firstName: application.firstName, lastName: application.lastName,
          passwordHash, mustChangePassword: true, status: "ACTIVE",
          ...(studentRoleId ? { roles: { connect: [{ id: studentRoleId.id }] } } : {}),
        },
      });
      const student = await tx.student.create({
        data: {
          schoolId, userId: studentUser.id, admissionNo, rollNumber,
          firstName: application.firstName, middleName: application.middleName, lastName: application.lastName,
          dateOfBirth: application.dateOfBirth, gender: application.gender, email: studentEmail,
          photoUrl: application.photoUrl, addressLine1: application.addressLine1,
          city: application.city, state: application.state, postalCode: application.postalCode,
          previousSchool: application.previousSchool, admissionDate: new Date(), status: "ACTIVE",
        },
      });
      newStudentId = student.id;
      const guardianUser = await tx.user.create({
        data: {
          schoolId, email: guardianEmail,
          firstName: application.guardianName.split(" ")[0] ?? application.guardianName,
          lastName: application.guardianName.split(" ").slice(1).join(" ") || null,
          phone: application.guardianPhone, passwordHash, mustChangePassword: true, status: "ACTIVE",
          ...(parentRoleId ? { roles: { connect: [{ id: parentRoleId.id }] } } : {}),
        },
      });
      const guardian = await tx.guardian.create({
        data: {
          schoolId, userId: guardianUser.id,
          firstName: application.guardianName.split(" ")[0] ?? application.guardianName,
          lastName: application.guardianName.split(" ").slice(1).join(" ") || null,
          email: application.guardianEmail, phone: application.guardianPhone,
          city: application.city, state: application.state,
        },
      });
      await tx.studentGuardian.create({
        data: {
          studentId: student.id, guardianId: guardian.id,
          relationship: application.relationship ?? "GUARDIAN", isPrimary: true, isFeePayer: true,
        },
      });
      await tx.enrollment.create({
        data: { schoolId, studentId: student.id, sectionId, academicYearId, rollNumber, isActive: true },
      });
      await tx.admissionApplication.update({
        where: { id: applicationId }, data: { status: "ENROLLED", studentId: student.id },
      });
      await tx.admissionEvent.create({
        data: {
          applicationId, fromStatus: application.status, toStatus: "ENROLLED",
          note: `Enrolled as ${admissionNo} in ${section.classLevel.name} ${section.name}.`,
          actorId: actorUserId,
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
    schoolId, channel: "EMAIL",
    recipient: application.guardianEmail ?? application.guardianPhone,
    subject: `Welcome to ${schoolName}`,
    body: `Dear Parent, ${application.firstName} has been enrolled in ${section.classLevel.name} ${section.name} with admission number ${admissionNo}. Portal sign-in: ${guardianEmail}, temporary password ${temporaryPassword} — you will be asked to change it on first sign-in.`,
  });

  await recordAudit({
    schoolId, userId: actorUserId,
    action: "admissions.enrol", entityType: "AdmissionApplication", entityId: applicationId,
    after: { admissionNo, sectionId, rollNumber },
  });

  return {
    ok: true,
    studentId: newStudentId,
    admissionNo,
    message: `Enrolled as ${admissionNo} in ${section.classLevel.name} ${section.name}. Portal logins created; temporary password ${temporaryPassword}.`,
  };
}
