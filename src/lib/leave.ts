/**
 * Leave rules — day counting and balance validation.
 *
 * Pure, so the request form, the approval screen and payroll's loss-of-pay
 * figure all count a leave the same way.
 */

export interface LeaveBalanceLike {
  allocated: number;
  used: number;
  carried?: number;
}

export function availableBalance(balance: LeaveBalanceLike): number {
  return balance.allocated + (balance.carried ?? 0) - balance.used;
}

/**
 * Chargeable leave days between two dates, inclusive.
 *
 * Weekly offs and declared holidays are excluded: a school does not deduct
 * Sunday from a teacher's casual leave because their absence spanned a
 * weekend.
 */
export function countLeaveDays(
  fromDate: Date,
  toDate: Date,
  options: {
    holidays?: readonly Date[];
    weeklyOffs?: readonly number[];
    halfDay?: boolean;
  } = {},
): number {
  const weeklyOffs = options.weeklyOffs ?? [0];
  const holidayKeys = new Set(
    (options.holidays ?? []).map((date) => date.toISOString().slice(0, 10)),
  );

  const start = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()),
  );
  if (end < start) return 0;

  let days = 0;
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (weeklyOffs.includes(cursor.getUTCDay())) continue;
    if (holidayKeys.has(cursor.toISOString().slice(0, 10))) continue;
    days += 1;
  }

  // A half-day only makes sense on a single working day.
  if (options.halfDay && days === 1) return 0.5;
  return days;
}

export interface LeaveValidation {
  ok: boolean;
  days: number;
  reason?: string;
}

/**
 * Validates a leave request against dates and the remaining balance.
 *
 * An unpaid leave type (quota of zero, `isPaid: false`) is allowed to exceed
 * the balance — that is what loss of pay means — but a paid type is not.
 */
export function validateLeaveRequest(input: {
  fromDate: Date;
  toDate: Date;
  balance?: LeaveBalanceLike | null;
  isPaid?: boolean;
  holidays?: readonly Date[];
  weeklyOffs?: readonly number[];
  halfDay?: boolean;
}): LeaveValidation {
  if (input.toDate < input.fromDate) {
    return { ok: false, days: 0, reason: "The end date is before the start date." };
  }

  const days = countLeaveDays(input.fromDate, input.toDate, {
    holidays: input.holidays,
    weeklyOffs: input.weeklyOffs,
    halfDay: input.halfDay,
  });

  if (days === 0) {
    return {
      ok: false,
      days: 0,
      reason: "Those dates fall entirely on holidays or weekly offs.",
    };
  }

  const isPaid = input.isPaid ?? true;
  if (isPaid && input.balance) {
    const available = availableBalance(input.balance);
    if (days > available) {
      return {
        ok: false,
        days,
        reason: `Only ${available} day${available === 1 ? "" : "s"} remain on this leave type, but ${days} requested.`,
      };
    }
  }

  return { ok: true, days };
}
