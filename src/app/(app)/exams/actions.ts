"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { generateReportCards } from "@/lib/grading";
import { queueNotification } from "@/lib/notifications";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/* Exam-term and exam setup                                                    */
/* -------------------------------------------------------------------------- */

const optionalExamDate = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? new Date(value) : null))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), {
    message: "That date could not be read",
  });

const TermSchema = z
  .object({
    name: z.string().trim().min(1, "A term name is required").max(60),
    sequence: z.coerce.number().int().min(1, "Sequence starts at 1").max(20),
    weightage: z.coerce.number().min(0).max(100),
    startDate: optionalExamDate,
    endDate: optionalExamDate,
  })
  .refine(
    (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
    { message: "The end date cannot be before the start date", path: ["endDate"] },
  );

/**
 * Creates an exam term (e.g. "Term 1") in the current academic year. Exams,
 * marks entry and report cards all hang off a term, so this is the first thing
 * an admin must set up each session.
 */
export async function createExamTerm(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = TermSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("exams.manage");
  const yearId = session.academicYear?.id;
  if (!yearId) {
    return { ok: false, message: "Set up a current academic year first.", values: raw };
  }
  const db = scopedDb(session.schoolId);

  const clash = await db.examTerm.findFirst({
    where: { academicYearId: yearId, name: parsed.data.name },
    select: { id: true },
  });
  if (clash) {
    return { ok: false, message: `A term named "${parsed.data.name}" already exists this year.`, values: raw };
  }

  const term = await db.examTerm.create({
    data: {
      schoolId: session.schoolId,
      academicYearId: yearId,
      name: parsed.data.name,
      sequence: parsed.data.sequence,
      weightage: parsed.data.weightage,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "exams.term.create",
    entityType: "ExamTerm",
    entityId: term.id,
    after: { name: term.name, sequence: parsed.data.sequence },
  });

  revalidatePath("/exams");
  return { ok: true, message: `Term "${term.name}" created. Add exams to it next.` };
}

const ExamSchema = z
  .object({
    termId: z.string().min(1, "Choose a term"),
    classLevelId: z.string().min(1, "Choose a class"),
    subjectId: z.string().min(1, "Choose a subject"),
    name: z.string().trim().min(1, "An exam name is required").max(60),
    maxMarks: z.coerce.number().min(1, "Max marks must be at least 1").max(1000),
    passMarks: z.coerce.number().min(0).max(1000),
  })
  .refine((data) => data.passMarks <= data.maxMarks, {
    message: "Pass marks cannot exceed the maximum",
    path: ["passMarks"],
  });

/**
 * Creates an exam paper: one subject, for one class, within a term. Marks entry
 * opens a grid per section once this exists.
 */
export async function createExam(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = ExamSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("exams.manage");
  const db = scopedDb(session.schoolId);

  const [term, classLevel, subject] = await Promise.all([
    db.examTerm.findUnique({ where: { id: parsed.data.termId }, select: { id: true, name: true } }),
    db.classLevel.findUnique({ where: { id: parsed.data.classLevelId }, select: { id: true, name: true } }),
    db.subject.findUnique({ where: { id: parsed.data.subjectId }, select: { id: true, name: true } }),
  ]);
  if (!term || !classLevel || !subject) {
    return { ok: false, message: "That term, class or subject does not exist in your school.", values: raw };
  }

  const clash = await db.exam.findFirst({
    where: {
      termId: term.id,
      classLevelId: classLevel.id,
      subjectId: subject.id,
      name: parsed.data.name,
    },
    select: { id: true },
  });
  if (clash) {
    return {
      ok: false,
      message: `${subject.name} "${parsed.data.name}" already exists for ${classLevel.name} in ${term.name}.`,
      values: raw,
    };
  }

  const exam = await db.exam.create({
    data: {
      schoolId: session.schoolId,
      termId: term.id,
      classLevelId: classLevel.id,
      subjectId: subject.id,
      name: parsed.data.name,
      maxMarks: parsed.data.maxMarks,
      passMarks: parsed.data.passMarks,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "exams.exam.create",
    entityType: "Exam",
    entityId: exam.id,
    after: {
      term: term.name,
      classLevel: classLevel.name,
      subject: subject.name,
      name: exam.name,
      maxMarks: parsed.data.maxMarks,
    },
  });

  revalidatePath("/exams");
  return {
    ok: true,
    message: `${subject.name} "${exam.name}" added for ${classLevel.name} in ${term.name}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Marks entry                                                                 */
/* -------------------------------------------------------------------------- */

const MarksSchema = z.object({
  examId: z.string().min(1),
  sectionId: z.string().min(1),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        /** Empty string means "not yet entered" and is skipped. */
        marks: z.string(),
        isAbsent: z.boolean(),
      }),
    )
    .min(1),
});

export async function saveMarks(
  input: z.infer<typeof MarksSchema>,
): Promise<ActionResult> {
  const parsed = MarksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("marks.enter");
  const db = scopedDb(session.schoolId);
  const { examId, sectionId, entries } = parsed.data;

  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: { id: true, maxMarks: true, subjectId: true, classLevelId: true, status: true },
  });
  if (!exam) return { ok: false, message: "Exam not found in your school." };

  const maxMarks = Number(exam.maxMarks);

  // Only students enrolled in this section may receive marks for it.
  const enrolled = await db.enrollment.findMany({
    where: {
      sectionId,
      isActive: true,
      ...(session.academicYear ? { academicYearId: session.academicYear.id } : {}),
    },
    select: { studentId: true },
  });
  const allowed = new Set(enrolled.map((row) => row.studentId));

  const invalid: string[] = [];
  const toWrite: { studentId: string; marksObtained: number | null; isAbsent: boolean }[] = [];

  for (const entry of entries) {
    if (!allowed.has(entry.studentId)) continue;

    if (entry.isAbsent) {
      toWrite.push({ studentId: entry.studentId, marksObtained: null, isAbsent: true });
      continue;
    }

    const trimmed = entry.marks.trim();
    if (trimmed === "") continue; // Not yet entered — leave any existing value alone.

    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0 || value > maxMarks) {
      invalid.push(entry.studentId);
      continue;
    }
    toWrite.push({ studentId: entry.studentId, marksObtained: value, isAbsent: false });
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      message: `${invalid.length} entr${invalid.length === 1 ? "y is" : "ies are"} outside the valid range 0–${maxMarks}. Nothing was saved.`,
    };
  }
  if (toWrite.length === 0) {
    return { ok: false, message: "No marks to save." };
  }

  await db.$transaction(
    toWrite.map((row) =>
      db.markEntry.upsert({
        where: { examId_studentId: { examId, studentId: row.studentId } },
        create: {
          schoolId: session.schoolId,
          examId,
          studentId: row.studentId,
          subjectId: exam.subjectId,
          marksObtained: row.marksObtained,
          isAbsent: row.isAbsent,
          recordedById: session.staffId,
        },
        update: {
          marksObtained: row.marksObtained,
          isAbsent: row.isAbsent,
          recordedById: session.staffId,
        },
      }),
    ),
  );

  // Move the exam along once marks start arriving, unless it is already past
  // this stage.
  if (exam.status === "PLANNED" || exam.status === "SCHEDULED" || exam.status === "ONGOING") {
    await db.exam.update({ where: { id: examId }, data: { status: "MARKS_ENTRY" } });
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "marks.enter",
    entityType: "Exam",
    entityId: examId,
    after: { sectionId, saved: toWrite.length, absent: toWrite.filter((r) => r.isAbsent).length },
  });

  revalidatePath(`/exams/${examId}/marks`);
  revalidatePath("/exams");

  return { ok: true, message: `Saved marks for ${toWrite.length} students.` };
}

/* -------------------------------------------------------------------------- */
/* Report cards                                                                */
/* -------------------------------------------------------------------------- */

const GenerateSchema = z.object({
  termId: z.string().min(1),
  sectionId: z.string().min(1),
});

export async function generateCards(
  input: z.infer<typeof GenerateSchema>,
): Promise<ActionResult> {
  const parsed = GenerateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Choose a term and a class." };
  }

  const session = await requirePermission("reportcards.generate");
  if (!session.academicYear) {
    return { ok: false, message: "No academic year is marked current." };
  }

  const result = await generateReportCards({
    schoolId: session.schoolId,
    academicYearId: session.academicYear.id,
    termId: parsed.data.termId,
    sectionId: parsed.data.sectionId,
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "reportcards.generate",
    entityType: "ExamTerm",
    entityId: parsed.data.termId,
    after: { sectionId: parsed.data.sectionId, ...result },
  });

  revalidatePath("/exams/report-cards");
  return { ok: result.generated > 0, message: result.message };
}

const PublishSchema = z.object({
  termId: z.string().min(1),
  sectionId: z.string().min(1),
});

/**
 * Publishes a section's report cards and notifies each guardian.
 *
 * Publishing is the point at which parents can see results, so it is a
 * separate, explicitly permissioned step rather than a side effect of
 * generation.
 */
export async function publishCards(
  input: z.infer<typeof PublishSchema>,
): Promise<ActionResult> {
  const parsed = PublishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a term and a class." };

  const session = await requirePermission("reportcards.publish");
  const db = scopedDb(session.schoolId);
  const { termId, sectionId } = parsed.data;

  const cards = await db.reportCard.findMany({
    where: {
      termId,
      isPublished: false,
      student: {
        enrollments: {
          some: {
            sectionId,
            ...(session.academicYear ? { academicYearId: session.academicYear.id } : {}),
          },
        },
      },
    },
    select: {
      id: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
          guardians: {
            where: { isPrimary: true },
            take: 1,
            select: { guardian: { select: { phone: true, email: true, userId: true } } },
          },
        },
      },
      term: { select: { name: true } },
    },
  });

  if (cards.length === 0) {
    return { ok: false, message: "There are no unpublished report cards for this class." };
  }

  await db.reportCard.updateMany({
    where: { id: { in: cards.map((card) => card.id) } },
    data: { isPublished: true, publishedAt: new Date() },
  });

  let notified = 0;
  for (const card of cards) {
    const guardian = card.student.guardians[0]?.guardian;
    if (!guardian) continue;
    const sent = await queueNotification({
      schoolId: session.schoolId,
      templateKey: "exam_result",
      channel: "PUSH",
      recipient: guardian.phone ?? guardian.email,
      userId: guardian.userId,
      variables: {
        studentName: `${card.student.firstName} ${card.student.lastName ?? ""}`.trim(),
        termName: card.term.name,
      },
    });
    if (sent) notified += 1;
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "reportcards.publish",
    entityType: "ExamTerm",
    entityId: termId,
    after: { sectionId, published: cards.length, notified },
  });

  revalidatePath("/exams/report-cards");
  return {
    ok: true,
    message: `Published ${cards.length} report cards and notified ${notified} guardians.`,
  };
}
