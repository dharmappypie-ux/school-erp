"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { validateAssignment, validateGrade } from "@/lib/homework";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const CreateSchema = z.object({
  sectionId: z.string().min(1, "Choose a class"),
  subjectId: z.string().min(1, "Choose a subject"),
  title: z.string().trim().min(3, "Give the assignment a title").max(200),
  description: z.string().trim().max(4000).optional(),
  dueOn: z.string().min(1, "Choose a due date"),
  maxMarks: z.string().optional(),
});

/**
 * Sets an assignment and opens a submission row for every enrolled student.
 *
 * The rows are created up front so the register is complete from day one: a
 * teacher can see who has not started, which is impossible if rows only appear
 * when a student submits.
 */
export async function createAssignment(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult & { values?: Record<string, string> }> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("homework.manage");
  const db = scopedDb(session.schoolId);

  const maxMarks = parsed.data.maxMarks?.trim() ? Number(parsed.data.maxMarks) : null;
  const assignedOn = new Date();
  const dueOn = new Date(parsed.data.dueOn);

  const check = validateAssignment({
    title: parsed.data.title,
    assignedOn,
    dueOn,
    maxMarks,
  });
  if (!check.ok) return { ok: false, message: check.reason ?? "Invalid", values: raw };

  const section = await db.section.findUnique({
    where: { id: parsed.data.sectionId },
    select: { id: true },
  });
  if (!section) return { ok: false, message: "That class is not in your school.", values: raw };

  const enrolments = await db.enrollment.findMany({
    where: { sectionId: parsed.data.sectionId, isActive: true },
    select: { studentId: true },
  });

  const homework = await db.homework.create({
    data: {
      schoolId: session.schoolId,
      sectionId: parsed.data.sectionId,
      subjectId: parsed.data.subjectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      assignedOn,
      dueOn,
      maxMarks,
      authorId: session.staffId ?? null,
      submissions: {
        create: enrolments.map((row) => ({
          studentId: row.studentId,
          status: "ASSIGNED" as const,
        })),
      },
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "homework.create",
    entityType: "Homework",
    entityId: homework.id,
    after: { title: homework.title, students: enrolments.length },
  });

  revalidatePath("/homework");
  return {
    ok: true,
    message: `“${homework.title}” set for ${enrolments.length} students.`,
  };
}

const GradeSchema = z.object({
  submissionId: z.string().min(1),
  marks: z.string().min(1, "Enter a mark"),
  feedback: z.string().trim().max(2000).optional(),
});

export async function gradeSubmission(
  input: z.infer<typeof GradeSchema>,
): Promise<ActionResult> {
  const parsed = GradeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("homework.manage");
  const db = scopedDb(session.schoolId);

  // tenant-safe: homework_submissions has no schoolId; the nested homework
  // filter names it so a submission from another school cannot be reached.
  const submission = await db.homeworkSubmission.findFirst({
    where: { id: parsed.data.submissionId, homework: { schoolId: session.schoolId } },
    select: {
      id: true,
      submittedAt: true,
      homework: { select: { id: true, maxMarks: true } },
    },
  });
  if (!submission) return { ok: false, message: "Submission not found in your school." };

  const maxMarks = submission.homework.maxMarks
    ? Number(submission.homework.maxMarks)
    : null;
  const marks = Number(parsed.data.marks);

  const check = validateGrade(marks, maxMarks);
  if (!check.ok) return { ok: false, message: check.reason ?? "Invalid mark" };

  // tenant-safe: `submission` was resolved above by a findFirst that required
  // homework.schoolId to match this session, so this id is already in-tenant.
  await db.homeworkSubmission.update({
    where: { id: submission.id },
    data: {
      marksObtained: marks,
      feedback: parsed.data.feedback || null,
      status: "GRADED",
      gradedAt: new Date(),
      gradedBy: session.staffId ?? null,
      // Marking work that was never submitted digitally means it was handed in
      // on paper. Stamping it now keeps the register honest rather than leaving
      // a graded row that still reads as "never handed in".
      ...(submission.submittedAt ? {} : { submittedAt: new Date() }),
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "homework.grade",
    entityType: "HomeworkSubmission",
    entityId: submission.id,
    after: { marks },
  });

  revalidatePath(`/homework/${submission.homework.id}`);
  return { ok: true, message: `Marked ${marks}${maxMarks ? ` / ${maxMarks}` : ""}.` };
}
