/**
 * Payslip calculation.
 *
 * Pure, so the payroll run, the staff profile preview and the tests all
 * produce the same figures. Money is handled in paise-precision numbers and
 * rounded once at the end of each component, never accumulated from rounded
 * intermediates.
 */

export type ComponentKind = "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION";
export type Calculation = "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS";

export interface SalaryComponentSpec {
  name: string;
  kind: ComponentKind;
  calculation: Calculation;
  /** A rupee amount for FIXED, otherwise a percentage. */
  value: number;
  sequence?: number;
}

export interface PayslipLineResult {
  name: string;
  kind: ComponentKind;
  amount: number;
}

export interface PayslipResult {
  lines: PayslipLineResult[];
  grossEarnings: number;
  totalDeductions: number;
  /** Employer-side costs (PF match, ESI) — not deducted from the employee. */
  employerContributions: number;
  netPay: number;
  workingDays: number;
  lopDays: number;
  paidDays: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds a payslip from a salary structure.
 *
 * Resolution runs in two passes because `PERCENT_OF_GROSS` components cannot
 * be computed until gross is known, and gross itself is the sum of the earning
 * components. Percent-of-gross earnings are therefore excluded from the base
 * gross — otherwise the definition would be circular, with each such component
 * inflating the number it is derived from.
 *
 * Loss-of-pay prorates **earnings only**. Statutory deductions such as
 * professional tax are not reduced because someone took unpaid leave.
 */
export function computePayslip(input: {
  basicSalary: number;
  components: readonly SalaryComponentSpec[];
  workingDays?: number;
  lopDays?: number;
}): PayslipResult {
  const { basicSalary, components } = input;
  const workingDays = input.workingDays ?? 30;
  const lopDays = Math.max(0, Math.min(input.lopDays ?? 0, workingDays));
  const paidDays = workingDays - lopDays;
  const proration = workingDays > 0 ? paidDays / workingDays : 1;

  const ordered = [...components].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
  );

  // Pass 1 — everything that does not depend on gross.
  const resolved = new Map<string, number>();
  for (const component of ordered) {
    if (component.calculation === "PERCENT_OF_GROSS") continue;

    // The "Basic" component carries the amount from the assignment rather
    // than from the structure, which stores a placeholder.
    const amount =
      component.name.toLowerCase() === "basic"
        ? basicSalary
        : component.calculation === "PERCENT_OF_BASIC"
          ? (basicSalary * component.value) / 100
          : component.value;

    resolved.set(component.name, amount);
  }

  const baseGross = ordered
    .filter(
      (component) =>
        component.kind === "EARNING" &&
        component.calculation !== "PERCENT_OF_GROSS",
    )
    .reduce((sum, component) => sum + (resolved.get(component.name) ?? 0), 0);

  // Pass 2 — percent-of-gross, against the base gross from pass 1.
  for (const component of ordered) {
    if (component.calculation !== "PERCENT_OF_GROSS") continue;
    resolved.set(component.name, (baseGross * component.value) / 100);
  }

  const lines: PayslipLineResult[] = [];
  let grossEarnings = 0;
  let totalDeductions = 0;
  let employerContributions = 0;

  for (const component of ordered) {
    const full = resolved.get(component.name) ?? 0;
    // Earnings shrink with unpaid leave; deductions do not.
    const amount = round2(
      component.kind === "EARNING" ? full * proration : full,
    );

    lines.push({ name: component.name, kind: component.kind, amount });

    if (component.kind === "EARNING") grossEarnings += amount;
    else if (component.kind === "DEDUCTION") totalDeductions += amount;
    else employerContributions += amount;
  }

  grossEarnings = round2(grossEarnings);
  totalDeductions = round2(totalDeductions);
  employerContributions = round2(employerContributions);

  return {
    lines,
    grossEarnings,
    totalDeductions,
    employerContributions,
    // Net can legitimately reach zero on heavy unpaid leave, but never
    // negative — the school does not bill an employee for turning up.
    netPay: round2(Math.max(0, grossEarnings - totalDeductions)),
    workingDays,
    lopDays,
    paidDays,
  };
}

/** Working days in a month, excluding Sundays and any listed holidays. */
export function workingDaysInMonth(
  year: number,
  month: number,
  holidays: readonly Date[] = [],
  weeklyOffs: readonly number[] = [0],
): number {
  const holidayKeys = new Set(
    holidays.map((date) => date.toISOString().slice(0, 10)),
  );
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (weeklyOffs.includes(date.getUTCDay())) continue;
    if (holidayKeys.has(date.toISOString().slice(0, 10))) continue;
    count += 1;
  }
  return count;
}
