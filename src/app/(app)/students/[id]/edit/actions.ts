"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { scopedDb } from "@/lib/tenant";

export interface EditStudentState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

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

const EditStudentSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().trim().min(1, "First name is required"),
  middleName: optionalText,
  lastName: optionalText,
  dateOfBirth: optionalText,
  gender: optionalEnum(["MALE", "FEMALE", "OTHER"] as const),
  bloodGroup: optionalText,
  category: optionalText,
  status: z.enum(["ACTIVE", "ALUMNI", "TRANSFERRED", "DROPPED", "SUSPENDED", "ON_LEAVE"]),
  phone: optionalText,
  email: optionalText,
  addressLine1: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  previousSchool: optionalText,
  medicalNotes: optionalText,
  exitReason: optionalText,
});

/**
 * Edits a student's profile and status.
 *
 * Moving a student OUT of ACTIVE stamps an exit date if there isn't one, and
 * moving them back to ACTIVE clears it — otherwise a re-admitted student keeps
 * a stale "left on" date that every report then trusts.
 */
export async function editStudent(
  _previous: EditStudentState,
  formData: FormData,
): Promise<EditStudentState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, String(v)]),
  );
  const parsed = EditStudentSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { ok: false, message: "Please correct the highlighted fields.", fieldErrors, values: raw };
  }

  const session = await requirePermission("students.update");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;

  const student = await db.student.findUnique({
    where: { id: input.id },
    select: { id: true, status: true, exitDate: true },
  });
  if (!student) return { ok: false, message: "Student not found in your school.", values: raw };

  const leavingActive = student.status === "ACTIVE" && input.status !== "ACTIVE";
  const returningActive = student.status !== "ACTIVE" && input.status === "ACTIVE";

  await db.student.update({
    where: { id: student.id },
    data: {
      firstName: input.firstName,
      middleName: input.middleName ?? null,
      lastName: input.lastName ?? null,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      gender: input.gender ?? null,
      bloodGroup: input.bloodGroup ?? null,
      category: input.category ?? null,
      status: input.status,
      phone: input.phone ?? null,
      email: input.email ?? null,
      addressLine1: input.addressLine1 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      previousSchool: input.previousSchool ?? null,
      medicalNotes: input.medicalNotes ?? null,
      exitReason: input.status === "ACTIVE" ? null : input.exitReason ?? null,
      exitDate: leavingActive
        ? (student.exitDate ?? new Date())
        : returningActive
          ? null
          : student.exitDate,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "students.update",
    entityType: "Student",
    entityId: student.id,
    after: { status: input.status },
  });

  revalidatePath(`/students/${student.id}`);
  revalidatePath("/students");
  return { ok: true, message: "Saved." };
}

const PromoteSchema = z.object({
  studentId: z.string().min(1),
  sectionId: z.string().min(1, "Choose the class to move into"),
  rollNumber: optionalText,
});

/**
 * Moves a student into a different class/section — a promotion, a demotion, or
 * a lateral move; the mechanics are the same.
 *
 * The current active enrollment is closed rather than deleted, so the student's
 * history in the old class survives (attendance, marks and report cards all
 * point at that enrollment). A new active enrollment is opened in the target
 * section. Both happen in one transaction so a student is never briefly in two
 * classes or none.
 */
export async function promoteStudent(
  _previous: EditStudentState,
  formData: FormData,
): Promise<EditStudentState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, String(v)]),
  );
  const parsed = PromoteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("students.update");
  const db = scopedDb(session.schoolId);

  const student = await db.student.findUnique({
    where: { id: parsed.data.studentId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!student) return { ok: false, message: "Student not found in your school.", values: raw };

  const section = await db.section.findUnique({
    where: { id: parsed.data.sectionId },
    select: {
      id: true,
      name: true,
      academicYearId: true,
      capacity: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });
  if (!section) return { ok: false, message: "That class is not in your school.", values: raw };

  const current = await db.enrollment.findFirst({
    where: { studentId: student.id, isActive: true },
    select: { id: true, sectionId: true },
  });

  if (current?.sectionId === section.id) {
    return { ok: false, message: `${student.firstName} is already in that class.`, values: raw };
  }

  if (section._count.enrollments >= section.capacity) {
    return {
      ok: false,
      message: `${section.classLevel.name} ${section.name} is full (${section._count.enrollments}/${section.capacity}).`,
      values: raw,
    };
  }

  await db.$transaction(async (tx) => {
    if (current) {
      await tx.enrollment.update({
        where: { id: current.id },
        data: { isActive: false, leftOn: new Date(), outcome: "PROMOTED" },
      });
    }
    await tx.enrollment.create({
      data: {
        schoolId: session.schoolId,
        studentId: student.id,
        sectionId: section.id,
        academicYearId: section.academicYearId,
        rollNumber: parsed.data.rollNumber ?? null,
        isActive: true,
      },
    });
    await tx.student.update({
      where: { id: student.id },
      data: {
        status: "ACTIVE",
        rollNumber: parsed.data.rollNumber ?? null,
      },
    });
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "students.promote",
    entityType: "Student",
    entityId: student.id,
    after: { section: `${section.classLevel.name} ${section.name}` },
  });

  revalidatePath(`/students/${student.id}`);
  revalidatePath("/students");
  return {
    ok: true,
    message: `${student.firstName} ${student.lastName ?? ""} moved to ${section.classLevel.name} ${section.name}.`,
  };
}
