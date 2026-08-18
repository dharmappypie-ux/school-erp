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
