/**
 * Homework rules.
 *
 * The distinction that matters here is between a submission that is *late* and
 * one that is *missing*. A teacher chasing missing work needs to know which
 * students have handed nothing in at all, and that is not the same question as
 * who was late — conflating them either nags students who did the work or lets
 * non-submitters disappear into a "late" bucket nobody follows up.
 */

export type SubmissionStatus =
  | "ASSIGNED"
  | "SUBMITTED"
  | "LATE"
  | "GRADED"
  | "RESUBMIT"
  | "MISSING";

export interface SubmissionInput {
  status: SubmissionStatus;
  submittedAt: Date | null;
  marksObtained: number | null;
}

/**
 * The status to display, which is not always the stored one.
 *
 * A row stored as ASSIGNED is only genuinely "not yet due"; once the deadline
 * passes with nothing submitted it is MISSING, and the register should say so
 * without waiting for a nightly job to rewrite it.
 */
export function displayStatus(
  submission: SubmissionInput,
  dueOn: Date,
  now: Date = new Date(),
): SubmissionStatus {
  if (submission.status === "GRADED") return "GRADED";
  if (submission.status === "RESUBMIT") return "RESUBMIT";

  if (submission.submittedAt) {
    return submission.submittedAt.getTime() > dueOn.getTime() ? "LATE" : "SUBMITTED";
  }

  return now.getTime() > dueOn.getTime() ? "MISSING" : "ASSIGNED";
}

export interface Progress {
  total: number;
  submitted: number;
  graded: number;
  missing: number;
  late: number;
  /** Share of the class that has handed something in, 0–100. */
  submissionRate: number;
  /** Share of what was handed in that has been marked, 0–100. */
  gradedRate: number;
}

export function progressOf(
  submissions: readonly SubmissionInput[],
  dueOn: Date,
  now: Date = new Date(),
): Progress {
  const states = submissions.map((s) => displayStatus(s, dueOn, now));

  const submitted = states.filter(
    (state) => state === "SUBMITTED" || state === "LATE" || state === "GRADED",
  ).length;
  const graded = states.filter((state) => state === "GRADED").length;
  const missing = states.filter((state) => state === "MISSING").length;
  const late = states.filter((state) => state === "LATE").length;
  const total = submissions.length;

  return {
    total,
    submitted,
    graded,
    missing,
    late,
    submissionRate: total > 0 ? Math.round((submitted / total) * 1000) / 10 : 0,
    // Denominator is what was handed in, not the class size: a teacher who has
    // marked everything received is at 100%, even with absentees outstanding.
    gradedRate: submitted > 0 ? Math.round((graded / submitted) * 1000) / 10 : 0,
  };
}

export interface Validation {
  ok: boolean;
  reason?: string;
}

/** Checks an assignment before it is set. */
export function validateAssignment(input: {
  title: string;
  assignedOn: Date;
  dueOn: Date;
  maxMarks: number | null;
}): Validation {
  if (input.title.trim().length < 3) {
    return { ok: false, reason: "Give the assignment a title." };
  }
  if (input.dueOn.getTime() < input.assignedOn.getTime()) {
    return { ok: false, reason: "The due date cannot be before the date set." };
  }
  if (input.maxMarks !== null) {
    if (!Number.isFinite(input.maxMarks) || input.maxMarks <= 0) {
      return { ok: false, reason: "Maximum marks must be a positive number." };
    }
    if (input.maxMarks > 1000) {
      return { ok: false, reason: "Maximum marks looks too high — check the value." };
    }
  }
  return { ok: true };
}

/** Checks a mark before it is recorded against a submission. */
export function validateGrade(
  marks: number,
  maxMarks: number | null,
): Validation {
  if (!Number.isFinite(marks)) return { ok: false, reason: "Enter a number." };
  if (marks < 0) return { ok: false, reason: "A mark cannot be negative." };
  if (maxMarks === null) {
    return { ok: false, reason: "This assignment carries no marks, so it cannot be graded." };
  }
  if (marks > maxMarks) {
    return { ok: false, reason: `The maximum for this assignment is ${maxMarks}.` };
  }
  return { ok: true };
}

/** Days until due; negative once overdue. */
export function daysUntilDue(dueOn: Date, now: Date = new Date()): number {
  const a = new Date(dueOn);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}
