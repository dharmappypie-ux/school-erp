"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { nextAdmissionNumber } from "@/lib/admissions";
import { hashPassword } from "@/lib/password";
import { scopedDb } from "@/lib/tenant";

export interface CreateStudentState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so a rejected form keeps what the user typed. */
  values?: Record<string, string>;
}

/**
 * An HTML select submits "" when nothing is chosen, which `z.enum().optional()`
 * rejects rather than treating as absent. Coerce it to undefined first, or a
 * user who simply left Gender blank gets a validation failure with no
 * indication of which field is wrong.
 */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.enum(values).optional(),
  );

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const CreateStudentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  middleName: optionalText,
  lastName: optionalText,
  dateOfBirth: optionalText,
  gender: optionalEnum(["MALE", "FEMALE", "OTHER"] as const),
  bloodGroup: optionalText,
  category: optionalText,
  sectionId: z.string().min(1, "Choose a class"),
  rollNumber: optionalText,
  addressLine1: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  previousSchool: optionalText,

  guardianName: z.string().trim().min(1, "Guardian name is required"),
  guardianPhone: z
    .string()
    .trim()
    .min(6, "Guardian phone is required"),
  guardianEmail: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  relationship: z.string().trim().default("FATHER"),
  occupation: optionalText,
});

/**
 * Creates a student, their primary guardian, portal logins for both, and the
 * enrolment — in one transaction, so a half-created child can never exist.
 *
 * Mirrors the admissions enrolment path; this is the direct-entry route for
 * students who did not come through an application.
 */
export async function createStudent(
  _previous: CreateStudentState,
  formData: FormData,
): Promise<CreateStudentState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)]),
  );

  const parsed = CreateStudentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { ok: false, message: "Please correct the highlighted fields.", fieldErrors, values: raw };
  }

  const session = await requirePermission("students.create");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;

  if (!session.academicYear) {
    return { ok: false, message: "No academic year is marked current.", values: raw };
  }
  const academicYearId = session.academicYear.id;

  const section = await db.section.findUnique({
    where: { id: input.sectionId },
    select: {
      id: true,
      name: true,
      capacity: true,
      academicYearId: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });
  if (!section || section.academicYearId !== academicYearId) {
    return { ok: false, message: "That class is not part of the current year.", values: raw };
  }
  if (section._count.enrollments >= section.capacity) {
    return {
      ok: false,
      message: `${section.classLevel.name} ${section.name} is full (${section.capacity} seats).`,
      values: raw,
    };
  }

  // Admission numbers follow the school's own code so they match those already
  // in use, and are derived from the highest existing number.
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

  const [studentRole, parentRole] = await Promise.all([
    db.role.findUnique({
      where: { schoolId_key: { schoolId: session.schoolId, key: "STUDENT" } },
      select: { id: true },
    }),
    db.role.findUnique({
      where: { schoolId_key: { schoolId: session.schoolId, key: "PARENT" } },
      select: { id: true },
    }),
  ]);

  const temporaryPassword = `${admissionNo}@${new Date().getFullYear()}`;
  const passwordHash = await hashPassword(temporaryPassword);
  const studentEmail = `${admissionNo.toLowerCase()}@${session.school.slug}.local`;
  const guardianEmail =
    input.guardianEmail ?? `parent.${admissionNo.toLowerCase()}@${session.school.slug}.local`;
  const rollNumber = input.rollNumber ?? String(section._count.enrollments + 1);

  let studentId: string;

  try {
    studentId = await db.$transaction(async (tx) => {
      const studentUser = await tx.user.create({
        data: {
          schoolId: session.schoolId,
          email: studentEmail,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
          mustChangePassword: true,
          status: "ACTIVE",
          ...(studentRole ? { roles: { connect: [{ id: studentRole.id }] } } : {}),
        },
      });

      const student = await tx.student.create({
        data: {
          schoolId: session.schoolId,
          userId: studentUser.id,
          admissionNo,
          rollNumber,
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          gender: input.gender,
          bloodGroup: input.bloodGroup,
          category: input.category,
          email: studentEmail,
          addressLine1: input.addressLine1,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
          previousSchool: input.previousSchool,
          admissionDate: new Date(),
          status: "ACTIVE",
        },
      });

      const guardianUser = await tx.user.create({
        data: {
          schoolId: session.schoolId,
          email: guardianEmail,
          firstName: input.guardianName.split(" ")[0] ?? input.guardianName,
          lastName: input.guardianName.split(" ").slice(1).join(" ") || null,
          phone: input.guardianPhone,
          passwordHash,
          mustChangePassword: true,
          status: "ACTIVE",
          ...(parentRole ? { roles: { connect: [{ id: parentRole.id }] } } : {}),
        },
      });

      const guardian = await tx.guardian.create({
        data: {
          schoolId: session.schoolId,
          userId: guardianUser.id,
          firstName: input.guardianName.split(" ")[0] ?? input.guardianName,
          lastName: input.guardianName.split(" ").slice(1).join(" ") || null,
          email: input.guardianEmail,
          phone: input.guardianPhone,
          occupation: input.occupation,
          city: input.city,
          state: input.state,
        },
      });

      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.id,
          relationship: input.relationship || "FATHER",
          isPrimary: true,
          isFeePayer: true,
        },
      });

      await tx.enrollment.create({
        data: {
          schoolId: session.schoolId,
          studentId: student.id,
          sectionId: input.sectionId,
          academicYearId,
          rollNumber,
          isActive: true,
        },
      });

      return student.id;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: message.includes("Unique constraint")
        ? "A student or login with those details already exists. Nothing was created."
        : `Could not create the student, and the change was rolled back: ${message}`,
      values: raw,
    };
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "students.create",
    entityType: "Student",
    entityId: studentId,
    after: { admissionNo, sectionId: input.sectionId, rollNumber },
  });

  revalidatePath("/students");
  revalidatePath("/dashboard");

  // Redirect throws, so it must sit outside the try/catch above.
  redirect(`/students/${studentId}?created=${encodeURIComponent(admissionNo)}`);
}
