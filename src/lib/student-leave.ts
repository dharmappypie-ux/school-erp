/**
 * Student leave: the rules, kept apart from the pages that use them.
 *
 * Two surfaces share these — the portal, where a guardian asks, and the staff
 * screen, where somebody decides — so the arithmetic of "how many days is this"
 * lives here rather than being written twice and drifting.
 */

export type LeavePortion = "FULL_DAY" | "FIRST_HALF" | "SECOND_HALF";

export const PORTION_LABEL: Record<LeavePortion, string> = {
  FULL_DAY: "Full day",
  FIRST_HALF: "First half — leaves at recess",
  SECOND_HALF: "Second half — arrives after recess",
};

/** Short form for tables, where the row is already crowded. */
export const PORTION_SHORT: Record<LeavePortion, string> = {
  FULL_DAY: "Full day",
  FIRST_HALF: "1st half",
  SECOND_HALF: "2nd half",
};

/**
 * Counts the days a request covers.
 *
 * A half day counts as 0.5 and only a single-date request may be a half day —
 * "first half of Monday to Wednesday" has no meaning, and allowing it would
 * put a fractional day into a three-day span.
 */
export function countLeaveDays(
  from: Date,
  to: Date,
  portion: LeavePortion,
): number {
  const start = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days <= 0) return 0;
  if (days === 1 && portion !== "FULL_DAY") return 0.5;
  return days;
}

export interface LeaveInput {
  fromDate: string;
  toDate: string;
  portion: LeavePortion;
  reason: string;
  leavingAfterPeriod?: string;
}

export interface LeaveValidation {
  ok: boolean;
  fieldErrors: Record<string, string>;
  parsed?: {
    from: Date;
    to: Date;
    portion: LeavePortion;
    days: number;
    leavingAfterPeriod: number | null;
  };
}

/** How far ahead a request may be dated. Beyond this it is almost always a typo. */
const MAX_FUTURE_DAYS = 365;
/** How far back. Enough to cover "he was ill last week and I forgot to tell you". */
const MAX_PAST_DAYS = 60;

export function validateLeave(input: LeaveInput, today: Date): LeaveValidation {
  const fieldErrors: Record<string, string> = {};

  const from = parseDay(input.fromDate);
  const to = parseDay(input.toDate);

  if (!from) fieldErrors.fromDate = "Choose the first day of leave";
  if (!to) fieldErrors.toDate = "Choose the last day of leave";

  const reason = input.reason.trim();
  if (reason.length < 3) {
    fieldErrors.reason = "Say why — the class teacher needs a reason";
  }

  let leavingAfterPeriod: number | null = null;
  if (input.leavingAfterPeriod && input.leavingAfterPeriod.trim() !== "") {
    const value = Number.parseInt(input.leavingAfterPeriod, 10);
    if (Number.isNaN(value) || value < 1 || value > 12) {
      fieldErrors.leavingAfterPeriod = "Enter a period between 1 and 12";
    } else {
      leavingAfterPeriod = value;
    }
  }

  if (from && to) {
    if (to < from) {
      fieldErrors.toDate = "The last day cannot be before the first day";
    }

    const midnight = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    const aheadDays = Math.floor((from.getTime() - midnight) / 86400000);
    if (aheadDays > MAX_FUTURE_DAYS) {
      fieldErrors.fromDate = "That is more than a year away — check the year";
    }
    if (aheadDays < -MAX_PAST_DAYS) {
      fieldErrors.fromDate = "That is more than two months ago";
    }

    const spansDays = countLeaveDays(from, to, "FULL_DAY");
    if (spansDays > 1 && input.portion !== "FULL_DAY") {
      fieldErrors.portion = "A half day applies to a single date only";
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !from || !to) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    fieldErrors: {},
    parsed: {
      from,
      to,
      portion: input.portion,
      days: countLeaveDays(from, to, input.portion),
      leavingAfterPeriod,
    },
  };
}

/** UTC midnight, matching every other date-only column in this codebase. */
function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLeaveSpan(
  from: Date,
  to: Date,
  portion: LeavePortion,
): string {
  const fmt = (date: Date) =>
    date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  if (from.getTime() === to.getTime()) {
    return portion === "FULL_DAY"
      ? fmt(from)
      : `${fmt(from)} · ${PORTION_SHORT[portion]}`;
  }
  return `${fmt(from)} – ${fmt(to)}`;
}
