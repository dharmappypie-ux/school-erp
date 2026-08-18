/**
 * Worksheet marking.
 *
 * The boundary this file defends: a multiple-choice answer has one right
 * value and can be marked by the machine; a written answer cannot. Guessing at
 * a written answer — string-matching it against a model answer — would quietly
 * mark a correct paraphrase wrong, and a teacher who trusted the total would
 * never look. So text answers are never auto-marked. They are flagged, counted,
 * and put in front of the teacher.
 */

export type QuestionType = "MULTIPLE_CHOICE" | "SHORT_TEXT" | "LONG_TEXT";

export interface QuestionSpec {
  id: string;
  type: QuestionType;
  /** Zero-based index of the right choice; null for text questions. */
  correctOption: number | null;
  options: readonly string[];
  marks: number;
}

export interface AnswerSpec {
  questionId: string;
  selectedOption: number | null;
  textAnswer: string | null;
}

export interface MarkedAnswer {
  questionId: string;
  /** Null when a human still has to decide. */
  isCorrect: boolean | null;
  awardedMarks: number | null;
  needsReview: boolean;
  /** Why it needs review, for the teacher's list. */
  reason?: "written answer" | "not answered" | "unmarkable question";
}

export interface MarkingResult {
  answers: MarkedAnswer[];
  /** Marks the machine could award with confidence. */
  autoAwarded: number;
  /** Marks still resting on the teacher's judgement. */
  pendingMarks: number;
  /** Total marks the worksheet is out of. */
  totalMarks: number;
  autoMarkedCount: number;
  needsReviewCount: number;
}

/** True when this question can be marked without a human. */
export function isAutoMarkable(question: QuestionSpec): boolean {
  return (
    question.type === "MULTIPLE_CHOICE" &&
    question.correctOption !== null &&
    question.correctOption >= 0 &&
    question.correctOption < question.options.length
  );
}

/**
 * Marks one submission's answers against the paper.
 *
 * Multiple-choice is all-or-nothing: half a right answer is not a thing, and
 * inventing partial credit would make the total unexplainable to a parent.
 */
export function markSubmission(
  questions: readonly QuestionSpec[],
  answers: readonly AnswerSpec[],
): MarkingResult {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));

  const marked: MarkedAnswer[] = questions.map((question) => {
    const answer = byQuestion.get(question.id);

    if (!isAutoMarkable(question)) {
      // A written answer, or a multiple-choice question the teacher never set
      // an answer for. Either way the machine must not guess.
      const answered =
        question.type === "MULTIPLE_CHOICE"
          ? answer?.selectedOption !== null && answer?.selectedOption !== undefined
          : Boolean(answer?.textAnswer && answer.textAnswer.trim());

      return {
        questionId: question.id,
        isCorrect: null,
        awardedMarks: null,
        needsReview: true,
        reason:
          question.type === "MULTIPLE_CHOICE"
            ? "unmarkable question"
            : answered
              ? "written answer"
              : "not answered",
      };
    }

    if (answer?.selectedOption === null || answer?.selectedOption === undefined) {
      // Nothing chosen scores nothing. This is decidable, so it is not review
      // work — a teacher should not have to click through blanks.
      return {
        questionId: question.id,
        isCorrect: false,
        awardedMarks: 0,
        needsReview: false,
      };
    }

    const correct = answer.selectedOption === question.correctOption;
    return {
      questionId: question.id,
      isCorrect: correct,
      awardedMarks: correct ? question.marks : 0,
      needsReview: false,
    };
  });

  const autoAwarded = marked.reduce((sum, row) => sum + (row.awardedMarks ?? 0), 0);
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  const pendingMarks = questions
    .filter((question) => marked.find((m) => m.questionId === question.id)?.needsReview)
    .reduce((sum, question) => sum + question.marks, 0);

  return {
    answers: marked,
    autoAwarded: Math.round(autoAwarded * 100) / 100,
    pendingMarks: Math.round(pendingMarks * 100) / 100,
    totalMarks: Math.round(totalMarks * 100) / 100,
    autoMarkedCount: marked.filter((row) => !row.needsReview).length,
    needsReviewCount: marked.filter((row) => row.needsReview).length,
  };
}

export interface Validation {
  ok: boolean;
  reason?: string;
}

/** Checks a question before it is added to a worksheet. */
export function validateQuestion(input: {
  prompt: string;
  type: QuestionType;
  options: readonly string[];
  correctOption: number | null;
  marks: number;
}): Validation {
  if (input.prompt.trim().length < 3) {
    return { ok: false, reason: "Write the question." };
  }
  if (!Number.isFinite(input.marks) || input.marks <= 0) {
    return { ok: false, reason: "Marks must be greater than zero." };
  }

  if (input.type !== "MULTIPLE_CHOICE") {
    return { ok: true };
  }

  const filled = input.options.filter((option) => option.trim().length > 0);
  if (filled.length < 2) {
    return { ok: false, reason: "A multiple-choice question needs at least two options." };
  }
  if (filled.length !== input.options.length) {
    return { ok: false, reason: "Remove the blank options, or fill them in." };
  }
  if (
    input.correctOption === null ||
    input.correctOption < 0 ||
    input.correctOption >= input.options.length
  ) {
    // Without an answer key the question cannot be auto-marked, which is the
    // whole point of drafting it here.
    return { ok: false, reason: "Mark which option is the correct answer." };
  }

  const seen = new Set(input.options.map((option) => option.trim().toLowerCase()));
  if (seen.size !== input.options.length) {
    return { ok: false, reason: "Two options are identical." };
  }

  return { ok: true };
}

/** The share of a worksheet a machine can mark, for the teacher's expectations. */
export function autoMarkableShare(questions: readonly QuestionSpec[]): number {
  if (questions.length === 0) return 0;
  const auto = questions.filter(isAutoMarkable).length;
  return Math.round((auto / questions.length) * 1000) / 10;
}
