import type { QuizStatus } from "@/generated/prisma/enums";

import type { Tone } from "@/components/ui";

/**
 * Quiz helpers shared by the staff and portal screens. Pure functions only — no
 * Prisma access — so grading and gamification maths run identically wherever
 * they are called.
 */

export const QUIZ_STATUS_LABEL: Record<QuizStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const QUIZ_STATUS_TONE: Record<QuizStatus, Tone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};

export interface GradableQuestion {
  id: string;
  correctOption: number;
  points: number;
}

export interface GradedAnswer {
  questionId: string;
  selectedOption: number | null;
  isCorrect: boolean;
  pointsAwarded: number;
}

/**
 * Grades one selection against a question. A blank (null) answer scores zero
 * without error — a student may leave a question unanswered.
 */
export function gradeAnswer(
  question: GradableQuestion,
  selectedOption: number | null | undefined,
): { isCorrect: boolean; pointsAwarded: number } {
  const isCorrect =
    selectedOption != null && selectedOption === question.correctOption;
  return { isCorrect, pointsAwarded: isCorrect ? question.points : 0 };
}

/**
 * Grades a whole attempt. `selections` maps question id → chosen option index
 * (or null). Returns the score, the maximum, and a per-question breakdown so
 * both the stored answers and the results screen come from one calculation.
 */
export function gradeAttempt(
  questions: GradableQuestion[],
  selections: Map<string, number | null>,
): { score: number; totalPoints: number; graded: GradedAnswer[] } {
  let score = 0;
  let totalPoints = 0;
  const graded: GradedAnswer[] = [];

  for (const question of questions) {
    totalPoints += question.points;
    const selected = selections.get(question.id) ?? null;
    const { isCorrect, pointsAwarded } = gradeAnswer(question, selected);
    score += pointsAwarded;
    graded.push({ questionId: question.id, selectedOption: selected, isCorrect, pointsAwarded });
  }

  return { score, totalPoints, graded };
}

/** Percentage score, rounded, guarding against a zero-point quiz. */
export function scorePercent(score: number, totalPoints: number): number {
  if (totalPoints <= 0) return 0;
  return Math.round((score / totalPoints) * 100);
}

/**
 * Is a quiz open to take right now? Published, and within its availability
 * window if one is set.
 */
export function isQuizOpen(
  quiz: { status: QuizStatus; availableFrom: Date | null; availableUntil: Date | null },
  now: Date = new Date(),
): boolean {
  if (quiz.status !== "PUBLISHED") return false;
  if (quiz.availableFrom && now < quiz.availableFrom) return false;
  if (quiz.availableUntil && now > quiz.availableUntil) return false;
  return true;
}

/**
 * Current daily streak: the number of consecutive days, ending today or
 * yesterday, on which the student completed at least one quiz. A gap of a full
 * day breaks it. Uses whole-day buckets — precise enough for a streak counter.
 */
export function computeStreak(completedDates: Date[]): number {
  if (completedDates.length === 0) return 0;
  const dayMs = 86_400_000;
  const toDay = (d: Date) => Math.floor(d.getTime() / dayMs);

  const days = [...new Set(completedDates.map(toDay))].sort((a, b) => b - a);
  const today = Math.floor(Date.now() / dayMs);

  // A streak only counts as "current" if the latest day is today or yesterday.
  if (days[0] !== today && days[0] !== today - 1) return 0;

  let streak = 1;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i] === days[i - 1] - 1) streak += 1;
    else break;
  }
  return streak;
}
