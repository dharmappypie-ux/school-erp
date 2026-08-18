/**
 * Library circulation rules — loan periods, fines and availability.
 *
 * Pure, so the counter UI, the overdue report and the tests all agree on what
 * a borrower owes.
 */

export interface LoanPolicy {
  /** Days a book may be kept before it falls due. */
  loanDays: number;
  /** Days past the due date before a fine starts accruing. */
  graceDays: number;
  finePerDay: number;
  /** Upper bound so a forgotten book cannot accrue an absurd debt. */
  maxFine: number;
  maxRenewals: number;
}

export const DEFAULT_LOAN_POLICY: LoanPolicy = {
  loanDays: 14,
  graceDays: 0,
  finePerDay: 2,
  maxFine: 200,
  maxRenewals: 2,
};

/** Whole days between two dates, ignoring clock time. */
function wholeDaysBetween(from: Date, to: Date): number {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function dueDateFor(issuedOn: Date, policy: LoanPolicy = DEFAULT_LOAN_POLICY): Date {
  const due = new Date(issuedOn);
  due.setDate(due.getDate() + policy.loanDays);
  return due;
}

export interface FineResult {
  daysOverdue: number;
  chargeableDays: number;
  amount: number;
  isCapped: boolean;
}

/**
 * Fine owed on a loan.
 *
 * Compared by whole days, so a book due today is not already overdue at 09:00.
 * A returned book is charged to its return date, not to now — otherwise a
 * fine would keep growing after the book was back on the shelf.
 */
export function computeFine(
  loan: { dueOn: Date; returnedOn?: Date | null },
  policy: LoanPolicy = DEFAULT_LOAN_POLICY,
  asOf: Date = new Date(),
): FineResult {
  const reference = loan.returnedOn ?? asOf;
  const daysOverdue = Math.max(0, wholeDaysBetween(loan.dueOn, reference));
  const chargeableDays = Math.max(0, daysOverdue - policy.graceDays);

  const raw = chargeableDays * policy.finePerDay;
  const amount = Math.min(raw, policy.maxFine);

  return {
    daysOverdue,
    chargeableDays,
    amount,
    isCapped: raw > policy.maxFine,
  };
}

export type CopyState =
  | "AVAILABLE"
  | "ISSUED"
  | "RESERVED"
  | "LOST"
  | "DAMAGED"
  | "UNDER_REPAIR"
  | "WITHDRAWN";

export interface Availability {
  total: number;
  available: number;
  onLoan: number;
  /** Lost, damaged, under repair or withdrawn — not lendable. */
  outOfCirculation: number;
  canIssue: boolean;
}

export function availability(states: readonly CopyState[]): Availability {
  const total = states.length;
  const available = states.filter((state) => state === "AVAILABLE").length;
  const onLoan = states.filter(
    (state) => state === "ISSUED" || state === "RESERVED",
  ).length;

  return {
    total,
    available,
    onLoan,
    outOfCirculation: total - available - onLoan,
    canIssue: available > 0,
  };
}

export interface RenewalCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Whether a loan may be renewed.
 *
 * Overdue books are blocked deliberately: renewing one would quietly erase the
 * fine already owed, and the borrower would never be prompted to settle it.
 */
export function canRenew(
  loan: { renewCount: number; dueOn: Date; returnedOn?: Date | null },
  options: { policy?: LoanPolicy; hasReservation?: boolean; asOf?: Date } = {},
): RenewalCheck {
  const policy = options.policy ?? DEFAULT_LOAN_POLICY;
  const asOf = options.asOf ?? new Date();

  if (loan.returnedOn) {
    return { allowed: false, reason: "This copy has already been returned." };
  }
  if (loan.renewCount >= policy.maxRenewals) {
    return {
      allowed: false,
      reason: `Already renewed ${loan.renewCount} times — the limit is ${policy.maxRenewals}.`,
    };
  }
  if (options.hasReservation) {
    return { allowed: false, reason: "Another borrower has reserved this title." };
  }
  if (wholeDaysBetween(loan.dueOn, asOf) > 0) {
    return { allowed: false, reason: "Overdue books must be returned, not renewed." };
  }
  return { allowed: true };
}
