"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasPermission } from "@/lib/permissions";
import { resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export interface SubmitResult {
  ok: boolean;
  message: string;
}

const Schema = z.object({
  submissionId: z.string().min(1),
  content: z.string().trim().min(1, "Write what you are handing in").max(5000),
  childId: z.string().optional(),
});

/**
 * Files a homework submission from the portal.
 *
 * The submission must belong to the student this viewer is entitled to see —
 * resolved through `resolvePortalStudent`, the same relationship check the rest
 * of the portal uses. A submission id from another family is not writable, so
 * guessing one achieves nothing.
 */
export async function submitHomework(
  input: z.infer<typeof Schema>,
): Promise<SubmitResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // resolvePortalStudent authenticates and confirms the viewer is entitled to
  // this child; it redirects rather than returning when they are not.
  const { context, child } = await resolvePortalStudent(parsed.data.childId);
  const session = context.session;

  if (!hasPermission(session.permissions, "homework.submit")) {
    return { ok: false, message: "Your account cannot submit homework." };
  }

  const db = scopedDb(session.schoolId);

  // tenant-safe: the submission must belong to this student, and the student
  // was resolved from the caller's own relationships within this school.
  const submission = await db.homeworkSubmission.findFirst({
    where: { id: parsed.data.submissionId, studentId: child.id },
    select: {
      id: true,
      status: true,
      homework: { select: { id: true, dueOn: true, title: true } },
    },
  });
  if (!submission) {
    return { ok: false, message: "That assignment is not on your list." };
  }

  if (submission.status === "GRADED") {
    // Overwriting graded work would silently discard the teacher's mark.
    return {
      ok: false,
      message: "This has already been marked. Ask your teacher if you need to resubmit.",
    };
  }

  const now = new Date();
  // Honest about lateness: the register shows the teacher when it arrived,
  // rather than quietly recording every late hand-in as on time.
  const late = now.getTime() > submission.homework.dueOn.getTime();

  // tenant-safe: `submission` was resolved by a findFirst requiring
  // studentId to equal the child this viewer is entitled to, which
  // resolvePortalStudent established from their own relationships.
  await db.homeworkSubmission.update({
    where: { id: submission.id },
    data: {
      content: parsed.data.content.trim(),
      submittedAt: now,
      status: late ? "LATE" : "SUBMITTED",
      submittedById: session.userId,
    },
  });

  revalidatePath("/portal/homework");
  return {
    ok: true,
    message: late
      ? "Submitted — your teacher will see it was after the due date."
      : "Submitted.",
  };
}

const AnswerSchema = z.object({
  submissionId: z.string().min(1),
  childId: z.string().optional(),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedOption: z.number().int().nullable(),
        textAnswer: z.string().max(5000).nullable(),
      }),
    )
    .max(100),
});

/**
 * Saves answers to a drafted worksheet.
 *
 * Answers are stored unmarked. Marking happens when the teacher runs the check,
 * so a student cannot see whether they were right by inspecting the response —
 * the answer key never reaches the browser.
 */
export async function saveAnswers(
  input: z.infer<typeof AnswerSchema>,
): Promise<SubmitResult> {
  const parsed = AnswerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { context, child } = await resolvePortalStudent(parsed.data.childId);
  const session = context.session;

  if (!hasPermission(session.permissions, "homework.submit")) {
    return { ok: false, message: "Your account cannot submit homework." };
  }

  const db = scopedDb(session.schoolId);

  // tenant-safe: the submission must belong to the child this viewer is
  // entitled to, resolved from their own relationships within this school.
  const submission = await db.homeworkSubmission.findFirst({
    where: { id: parsed.data.submissionId, studentId: child.id },
    select: {
      id: true,
      status: true,
      homework: {
        select: { dueOn: true, questions: { select: { id: true } } },
      },
    },
  });
  if (!submission) return { ok: false, message: "That assignment is not on your list." };
  if (submission.status === "GRADED") {
    return { ok: false, message: "This has already been marked." };
  }

  // Only answers to questions actually on this worksheet are accepted.
  const valid = new Set(submission.homework.questions.map((question) => question.id));

  for (const answer of parsed.data.answers) {
    if (!valid.has(answer.questionId)) continue;

    // tenant-safe: submissionId was resolved against this child above.
    await db.homeworkAnswer.upsert({
      where: {
        submissionId_questionId: {
          submissionId: submission.id,
          questionId: answer.questionId,
        },
      },
      update: {
        selectedOption: answer.selectedOption,
        textAnswer: answer.textAnswer,
        // Re-answering clears any earlier marking; the teacher checks again.
        isCorrect: null,
        awardedMarks: null,
        needsReview: false,
      },
      create: {
        submissionId: submission.id,
        questionId: answer.questionId,
        selectedOption: answer.selectedOption,
        textAnswer: answer.textAnswer,
      },
    });
  }

  const now = new Date();
  const late = now.getTime() > submission.homework.dueOn.getTime();

  // tenant-safe: see above.
  await db.homeworkSubmission.update({
    where: { id: submission.id },
    data: {
      submittedAt: now,
      status: late ? "LATE" : "SUBMITTED",
      submittedById: session.userId,
      marksObtained: null,
    },
  });

  revalidatePath("/portal/homework");
  return {
    ok: true,
    message: late
      ? "Answers sent — your teacher will see it was after the due date."
      : "Answers sent to your teacher.",
  };
}
