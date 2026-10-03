"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  normaliseSubjectCode,
  validateMarks,
  validateSubjectCode,
} from "@/lib/academics";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const SubjectSchema = z.object({
  name: z.string().trim().min(2, "A subject name is required").max(80),
  code: z.string().trim().min(1, "A subject code is required"),
  departmentId: z.string().trim().optional(),
  isElective: z.union([z.boolean(), z.string()]).optional(),
  isCoScholastic: z.union([z.boolean(), z.string()]).optional(),
});

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "on";
}

/**
 * Creates a subject.
 *
 * Co-scholastic subjects are marked ungraded here, which is what keeps Art and
 * PE out of the report card percentage later — setting it wrong at creation is
 * only noticed at results time.
 */
export async function createSubject(
  input: z.infer<typeof SubjectSchema>,
): Promise<ActionResult> {
  const parsed = SubjectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("academics.manage");
  const db = scopedDb(session.schoolId);

  const code = normaliseSubjectCode(parsed.data.code);
  const codeCheck = validateSubjectCode(parsed.data.code);
  if (!codeCheck.ok) {
    return { ok: false, message: codeCheck.reason! };
  }

  const existing = await db.subject.findFirst({ where: { code } });
  if (existing) {
    return { ok: false, message: `Subject code ${code} is already in use.` };
  }

  const isCoScholastic = truthy(parsed.data.isCoScholastic);

  const subject = await db.subject.create({
    data: {
      // scopedDb injects this at runtime too; passing it keeps the types
      // honest and matches every other create in the codebase.
      schoolId: session.schoolId,
      name: parsed.data.name,
      code,
      departmentId: parsed.data.departmentId || null,
      isElective: truthy(parsed.data.isElective),
      isCoScholastic,
      // Co-scholastic areas are graded separately and must not dilute the
      // academic percentage.
      isGraded: !isCoScholastic,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "academics.subject.create",
    entityType: "Subject",
    entityId: subject.id,
    after: { name: subject.name, code, isCoScholastic },
  });

  revalidatePath("/academics");
  return { ok: true, message: `${subject.name} (${code}) added.` };
}

const ClassLevelSchema = z.object({
  name: z.string().trim().min(1, "A class name is required").max(60),
  numericOrder: z.coerce
    .number({ message: "Order must be a number" })
    .int()
    .min(0, "Order cannot be negative")
    .max(100),
  stream: z.string().trim().max(40).optional(),
});

/**
 * Creates a class level (grade). `numericOrder` is what every class-ordered
 * list sorts on, so it must be unique enough to give a stable order; the name
 * is unique per school by schema.
 */
export async function createClassLevel(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = ClassLevelSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("academics.manage");
  const db = scopedDb(session.schoolId);

  const clash = await db.classLevel.findFirst({
    where: { name: parsed.data.name },
    select: { id: true },
  });
  if (clash) {
    return { ok: false, message: `A class named "${parsed.data.name}" already exists.`, values: raw };
  }

  const level = await db.classLevel.create({
    data: {
      schoolId: session.schoolId,
      name: parsed.data.name,
      numericOrder: parsed.data.numericOrder,
      stream: parsed.data.stream || null,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "academics.classlevel.create",
    entityType: "ClassLevel",
    entityId: level.id,
    after: { name: level.name, numericOrder: parsed.data.numericOrder },
  });

  revalidatePath("/academics");
  return { ok: true, message: `Class "${level.name}" created. Add its sections next.` };
}

const SectionSchema = z.object({
  classLevelId: z.string().min(1, "Choose a class"),
  name: z.string().trim().min(1, "A section name is required").max(40),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(200),
  roomNumber: z.string().trim().max(40).optional(),
  classTeacherId: z.string().trim().optional(),
});

/**
 * Creates a section within a class for the current academic year. Enrolment and
 * promotion can only target sections that exist, so this is the prerequisite
 * for admitting or moving students into a new class.
 */
export async function createSection(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = SectionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("academics.manage");
  const yearId = session.academicYear?.id;
  if (!yearId) {
    return {
      ok: false,
      message: "Set up a current academic year before creating sections.",
      values: raw,
    };
  }
  const db = scopedDb(session.schoolId);

  const classLevel = await db.classLevel.findUnique({
    where: { id: parsed.data.classLevelId },
    select: { id: true, name: true },
  });
  if (!classLevel) {
    return { ok: false, message: "That class does not exist in your school.", values: raw };
  }

  if (parsed.data.classTeacherId) {
    const teacher = await db.staffMember.findUnique({
      where: { id: parsed.data.classTeacherId },
      select: { id: true },
    });
    if (!teacher) {
      return { ok: false, message: "That class teacher does not exist.", values: raw };
    }
  }

  const clash = await db.section.findFirst({
    where: { academicYearId: yearId, classLevelId: classLevel.id, name: parsed.data.name },
    select: { id: true },
  });
  if (clash) {
    return {
      ok: false,
      message: `${classLevel.name} already has a section "${parsed.data.name}" this year.`,
      values: raw,
    };
  }

  const section = await db.section.create({
    data: {
      schoolId: session.schoolId,
      academicYearId: yearId,
      classLevelId: classLevel.id,
      name: parsed.data.name,
      capacity: parsed.data.capacity,
      roomNumber: parsed.data.roomNumber || null,
      classTeacherId: parsed.data.classTeacherId || null,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "academics.section.create",
    entityType: "Section",
    entityId: section.id,
    after: { classLevel: classLevel.name, name: section.name, capacity: parsed.data.capacity },
  });

  revalidatePath("/academics");
  return {
    ok: true,
    message: `${classLevel.name} ${section.name} created with ${parsed.data.capacity} seats.`,
  };
}

const AssignSchema = z.object({
  classLevelId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().optional(),
  weeklyPeriods: z.coerce.number().int().min(0).max(20),
  maxMarks: z.coerce.number().int().min(1).max(1000),
  passMarks: z.coerce.number().int().min(0).max(1000),
});

/**
 * Maps a subject onto a class, or updates the mapping.
 *
 * `weeklyPeriods: 0` removes the subject from the class rather than leaving a
 * zero-period row the timetable would silently ignore.
 */
export async function assignSubject(
  input: z.infer<typeof AssignSchema>,
): Promise<ActionResult> {
  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("academics.manage");
  const db = scopedDb(session.schoolId);
  const { classLevelId, subjectId, teacherId, weeklyPeriods, maxMarks, passMarks } =
    parsed.data;

  const marks = validateMarks(maxMarks, passMarks);
  if (!marks.ok) return { ok: false, message: marks.reason! };

  const [classLevel, subject] = await Promise.all([
    db.classLevel.findUnique({ where: { id: classLevelId }, select: { id: true, name: true } }),
    db.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } }),
  ]);
  if (!classLevel || !subject) {
    return { ok: false, message: "That class or subject does not exist in your school." };
  }

  if (teacherId) {
    const teacher = await db.staffMember.findUnique({
      where: { id: teacherId },
      select: { id: true },
    });
    if (!teacher) {
      return { ok: false, message: "That teacher does not exist in your school." };
    }
  }

  // tenant-safe: classLevelId is validated against scopedDb.classLevel above.
  const existing = await db.classSubject.findFirst({
    where: { classLevelId, subjectId, sectionId: null },
    select: { id: true },
  });

  if (weeklyPeriods === 0) {
    if (!existing) {
      return { ok: false, message: `${subject.name} is not on ${classLevel.name}'s curriculum.` };
    }
    // tenant-safe: the row was located through the scoped lookup above.
    await db.classSubject.delete({ where: { id: existing.id } });

    await recordAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: "academics.subject.unassign",
      entityType: "ClassSubject",
      entityId: existing.id,
      before: { classLevel: classLevel.name, subject: subject.name },
    });

    revalidatePath("/academics");
    revalidatePath("/timetable");
    return {
      ok: true,
      message: `${subject.name} removed from ${classLevel.name}. Regenerate the timetable to apply it.`,
    };
  }

  if (existing) {
    // tenant-safe: the row was located through the scoped lookup above.
    await db.classSubject.update({
      where: { id: existing.id },
      data: { teacherId: teacherId || null, weeklyPeriods, maxMarks, passMarks },
    });
  } else {
    // tenant-safe: classLevelId and subjectId are both validated above.
    await db.classSubject.create({
      data: {
        classLevelId,
        subjectId,
        teacherId: teacherId || null,
        weeklyPeriods,
        maxMarks,
        passMarks,
      },
    });
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "academics.subject.assign",
    entityType: "ClassSubject",
    entityId: `${classLevelId}:${subjectId}`,
    after: { classLevel: classLevel.name, subject: subject.name, weeklyPeriods, teacherId },
  });

  revalidatePath("/academics");
  revalidatePath("/timetable");

  return {
    ok: true,
    message: `${subject.name} set to ${weeklyPeriods} periods a week for ${classLevel.name}. Regenerate the timetable to apply it.`,
  };
}
