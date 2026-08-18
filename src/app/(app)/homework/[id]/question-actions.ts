"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";
import { markSubmission, validateQuestion, type QuestionSpec } from "@/lib/worksheet";

export interface Result {
  ok: boolean;
  message: string;
}

const QuestionSchema = z.object({
  homeworkId: z.string().min(1),
  prompt: z.string().trim().min(3, "Write the question").max(1000),
  type: z.enum(["MULTIPLE_CHOICE", "SHORT_TEXT", "LONG_TEXT"]),
  options: z.array(z.string().trim().max(300)).max(6),
  correctOption: z.number().int().nullable(),
  expectedAnswer: z.string().trim().max(2000).optional(),
  marks: z.coerce.number().positive(),
});

/** Adds a question to a worksheet. */
export async function addQuestion(
  input: z.infer<typeof QuestionSchema>,
): Promise<Result> {
  const parsed = QuestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("homework.manage");
  const db = scopedDb(session.schoolId);

  const options =
    parsed.data.type === "MULTIPLE_CHOICE"
      ? parsed.data.options.filter((option) => option.length > 0)
      : [];

  const check = validateQuestion({
    prompt: parsed.data.prompt,
    type: parsed.data.type,
    options,
    correctOption: parsed.data.type === "MULTIPLE_CHOICE" ? parsed.data.correctOption : null,
    marks: parsed.data.marks,
  });
  if (!check.ok) return { ok: false, message: check.reason ?? "Invalid question" };

  const homework = await db.homework.findUnique({
    where: { id: parsed.data.homeworkId },
    select: { id: true },
  });
  if (!homework) return { ok: false, message: "Assignment not found in your school." };

  // tenant-safe: homework_questions has no schoolId; the parent homework was
  // just resolved through scopedDb, so it belongs to this school.
  const last = await db.homeworkQuestion.findFirst({
    where: { homeworkId: homework.id },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  // tenant-safe: homeworkId is the row just resolved through scopedDb, so the
  // question is attached to an assignment in this school.
  await db.homeworkQuestion.create({
    data: {
      homeworkId: homework.id,
      sequence: (last?.sequence ?? 0) + 1,
      prompt: parsed.data.prompt,
      type: parsed.data.type,
      options,
      correctOption:
        parsed.data.type === "MULTIPLE_CHOICE" ? parsed.data.correctOption : null,
      expectedAnswer: parsed.data.expectedAnswer || null,
      marks: parsed.data.marks,
    },
  });

  revalidatePath(`/homework/${homework.id}`);
  return { ok: true, message: "Question added." };
}

export async function deleteQuestion(questionId: string): Promise<Result> {
  const session = await requirePermission("homework.manage");
  const db = scopedDb(session.schoolId);

  // tenant-safe: reaches the tenant through the parent homework's schoolId.
  const question = await db.homeworkQuestion.findFirst({
    where: { id: questionId, homework: { schoolId: session.schoolId } },
    select: { id: true, homeworkId: true },
  });
  if (!question) return { ok: false, message: "Question not found in your school." };

  // tenant-safe: `question` was resolved by a findFirst requiring
  // homework.schoolId to match this session.
  await db.homeworkQuestion.delete({ where: { id: question.id } });

  revalidatePath(`/homework/${question.homeworkId}`);
  return { ok: true, message: "Question removed." };
}

export interface CheckResult extends Result {
  marked?: number;
  needsReview?: number;
}

/**
 * Marks every submission on this worksheet in one pass.
 *
 * Multiple choice is settled outright. Written answers are recorded as needing
 * review and are never given a mark here — the teacher's total is only ever
 * raised by a human deciding, so a "checked" worksheet with outstanding written
 * work still says so.
 */
export async function checkAllAnswers(homeworkId: string): Promise<CheckResult> {
  const session = await requirePermission("homework.manage");
  const db = scopedDb(session.schoolId);

  const homework = await db.homework.findUnique({
    where: { id: homeworkId },
    select: {
      id: true,
      maxMarks: true,
      questions: {
        orderBy: { sequence: "asc" },
        select: { id: true, type: true, correctOption: true, options: true, marks: true },
      },
      submissions: {
        select: {
          id: true,
          status: true,
          submittedAt: true,
          answers: {
            select: { questionId: true, selectedOption: true, textAnswer: true },
          },
        },
      },
    },
  });
  if (!homework) return { ok: false, message: "Assignment not found in your school." };
  if (homework.questions.length === 0) {
    return { ok: false, message: "This worksheet has no questions to check." };
  }

  const spec: QuestionSpec[] = homework.questions.map((question) => ({
    id: question.id,
    type: question.type,
    correctOption: question.correctOption,
    options: question.options,
    marks: Number(question.marks),
  }));

  let marked = 0;
  let needsReview = 0;

  for (const submission of homework.submissions) {
    // Only work that was actually handed in is marked.
    if (!submission.submittedAt) continue;

    const result = markSubmission(spec, submission.answers);

    for (const answer of result.answers) {
      // Upsert rather than update: a student who skipped a written question has
      // no answer row, and an update would silently no-op — dropping them out
      // of the review queue as though the question did not exist.
      // tenant-safe: submissionId comes from this homework, resolved above.
      await db.homeworkAnswer.upsert({
        where: {
          submissionId_questionId: {
            submissionId: submission.id,
            questionId: answer.questionId,
          },
        },
        update: {
          isCorrect: answer.isCorrect,
          awardedMarks: answer.awardedMarks,
          needsReview: answer.needsReview,
        },
        create: {
          submissionId: submission.id,
          questionId: answer.questionId,
          isCorrect: answer.isCorrect,
          awardedMarks: answer.awardedMarks,
          needsReview: answer.needsReview,
        },
      });
    }

    // The recorded mark is the auto-awarded part only. Anything still with the
    // teacher is excluded, so a partial total is never mistaken for a final one.
    // tenant-safe: submission belongs to `homework`, resolved through scopedDb.
    await db.homeworkSubmission.update({
      where: { id: submission.id },
      data: {
        marksObtained: result.autoAwarded,
        status: result.needsReviewCount > 0 ? submission.status : "GRADED",
        gradedAt: result.needsReviewCount > 0 ? null : new Date(),
        gradedBy: result.needsReviewCount > 0 ? null : (session.staffId ?? null),
      },
    });

    marked += 1;
    needsReview += result.needsReviewCount;
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "homework.autocheck",
    entityType: "Homework",
    entityId: homework.id,
    after: { submissions: marked, answersNeedingReview: needsReview },
  });

  revalidatePath(`/homework/${homework.id}`);
  return {
    ok: true,
    marked,
    needsReview,
    message:
      needsReview > 0
        ? `Checked ${marked} submissions. ${needsReview} written answers need your eye.`
        : `Checked ${marked} submissions. Nothing left to review.`,
  };
}
