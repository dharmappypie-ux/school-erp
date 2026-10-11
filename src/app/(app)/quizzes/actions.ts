"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission, requireFeature } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const QuizSchema = z.object({
  title: z.string().trim().min(2, "A quiz title is required").max(120),
  description: z.string().trim().max(1000).optional(),
  classLevelId: z.string().trim().optional(),
  subjectId: z.string().trim().optional(),
  teacherId: z.string().trim().optional(),
  timeLimitMinutes: z.coerce.number().int().min(0).max(240).optional(),
});

/** Creates a quiz as a DRAFT. It reaches students only once published. */
export async function createQuiz(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = QuizSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("quiz.manage");
  await requireFeature("lms");
  const db = scopedDb(session.schoolId);
  const { title, description, classLevelId, subjectId, teacherId, timeLimitMinutes } = parsed.data;

  if (classLevelId) {
    const level = await db.classLevel.findUnique({ where: { id: classLevelId }, select: { id: true } });
    if (!level) return { ok: false, message: "That class does not exist in your school.", values: raw };
  }
  if (subjectId) {
    const subject = await db.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
    if (!subject) return { ok: false, message: "That subject does not exist in your school.", values: raw };
  }
  if (teacherId) {
    const teacher = await db.staffMember.findUnique({ where: { id: teacherId }, select: { id: true } });
    if (!teacher) return { ok: false, message: "That teacher does not exist in your school.", values: raw };
  }

  const quiz = await db.quiz.create({
    data: {
      schoolId: session.schoolId,
      title,
      description: description || null,
      classLevelId: classLevelId || null,
      subjectId: subjectId || null,
      teacherId: teacherId || null,
      timeLimitMinutes: timeLimitMinutes && timeLimitMinutes > 0 ? timeLimitMinutes : null,
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "quiz.create",
    entityType: "Quiz",
    entityId: quiz.id,
    after: { title: quiz.title },
  });

  revalidatePath("/quizzes");
  return { ok: true, message: `“${quiz.title}” created. Add questions, then publish it.` };
}

const StatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

/** Publishes / unpublishes / archives a quiz. Publishing needs a question. */
export async function setQuizStatus(
  quizId: string,
  status: z.infer<typeof StatusSchema>,
): Promise<ActionResult> {
  const parsed = StatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, message: "Invalid status." };

  const session = await requirePermission(
    parsed.data === "PUBLISHED" ? "quiz.publish" : "quiz.manage",
  );
  await requireFeature("lms");
  const db = scopedDb(session.schoolId);

  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, title: true, status: true, _count: { select: { questions: true } } },
  });
  if (!quiz) return { ok: false, message: "Quiz not found." };

  if (parsed.data === "PUBLISHED" && quiz._count.questions === 0) {
    return { ok: false, message: "Add at least one question before publishing." };
  }

  await db.quiz.update({
    where: { id: quizId },
    data: {
      status: parsed.data,
      publishedAt: parsed.data === "PUBLISHED" ? new Date() : null,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: `quiz.${parsed.data.toLowerCase()}`,
    entityType: "Quiz",
    entityId: quiz.id,
    before: { status: quiz.status },
    after: { status: parsed.data },
  });

  revalidatePath("/quizzes");
  revalidatePath(`/quizzes/${quizId}`);
  revalidatePath("/portal/quizzes");
  const verb =
    parsed.data === "PUBLISHED" ? "published" : parsed.data === "ARCHIVED" ? "archived" : "moved to draft";
  return { ok: true, message: `“${quiz.title}” ${verb}.` };
}

const QuestionSchema = z.object({
  quizId: z.string().min(1),
  prompt: z.string().trim().min(2, "A question is required").max(500),
  option0: z.string().trim().max(200).optional(),
  option1: z.string().trim().max(200).optional(),
  option2: z.string().trim().max(200).optional(),
  option3: z.string().trim().max(200).optional(),
  correctOption: z.coerce.number().int().min(0).max(3),
  points: z.coerce.number().int().min(1).max(100),
  explanation: z.string().trim().max(500).optional(),
});

/**
 * Adds a question to a quiz. Up to four options are accepted; blanks are
 * dropped and the correct-answer index is remapped onto what remains, so a
 * teacher can leave options empty without breaking the key.
 */
export async function addQuestion(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = QuestionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("quiz.manage");
  await requireFeature("lms");
  const db = scopedDb(session.schoolId);
  const { quizId, prompt, correctOption, points, explanation } = parsed.data;

  const rawOptions = [parsed.data.option0, parsed.data.option1, parsed.data.option2, parsed.data.option3];
  const options: string[] = [];
  let remappedCorrect = -1;
  rawOptions.forEach((value, index) => {
    const text = (value ?? "").trim();
    if (text.length === 0) return;
    if (index === correctOption) remappedCorrect = options.length;
    options.push(text);
  });

  if (options.length < 2) {
    return { ok: false, message: "Give at least two options.", values: raw };
  }
  if (remappedCorrect < 0) {
    return { ok: false, message: "The correct option cannot be a blank choice.", values: raw };
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return { ok: false, message: "Options must be distinct.", values: raw };
  }

  // Quiz is tenant-scoped, so this lookup also proves it is ours.
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { id: true } });
  if (!quiz) return { ok: false, message: "Quiz not found.", values: raw };

  // tenant-safe: quizId was validated against the scoped quiz lookup above.
  const last = await db.quizQuestion.findFirst({
    where: { quizId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;

  // tenant-safe: quizId was validated against the scoped quiz lookup above.
  const question = await db.quizQuestion.create({
    data: {
      quizId,
      sequence,
      prompt,
      options,
      correctOption: remappedCorrect,
      points,
      explanation: explanation || null,
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "quiz.question.create",
    entityType: "QuizQuestion",
    entityId: question.id,
    after: { quizId, sequence, points },
  });

  revalidatePath(`/quizzes/${quizId}`);
  return { ok: true, message: `Question ${sequence} added.` };
}

/** Deletes a question and renumbers the ones after it, in a transaction. */
export async function deleteQuestion(questionId: string): Promise<ActionResult> {
  const session = await requirePermission("quiz.manage");
  await requireFeature("lms");
  const db = scopedDb(session.schoolId);

  // tenant-safe: the question is reached through its quiz, filtered to this school.
  const question = await db.quizQuestion.findFirst({
    where: { id: questionId, quiz: { schoolId: session.schoolId } },
    select: { id: true, quizId: true, sequence: true },
  });
  if (!question) return { ok: false, message: "Question not found." };

  // tenant-safe: both writes target the question located above via its quiz,
  // and the renumber is confined to that same quiz.
  await db.$transaction([
    db.quizQuestion.delete({ where: { id: question.id } }),
    db.quizQuestion.updateMany({
      where: { quizId: question.quizId, sequence: { gt: question.sequence } },
      data: { sequence: { decrement: 1 } },
    }),
  ]);

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "quiz.question.delete",
    entityType: "QuizQuestion",
    entityId: question.id,
    before: { quizId: question.quizId },
  });

  revalidatePath(`/quizzes/${question.quizId}`);
  return { ok: true, message: "Question removed." };
}
