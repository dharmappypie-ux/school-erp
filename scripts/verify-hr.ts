/**
 * Checks payroll calculation and leave rules.
 *
 *   npx tsx scripts/verify-hr.ts
 *
 * Payroll decides what lands in someone's bank account, so the awkward cases —
 * percent-of-gross resolution, loss-of-pay proration, and which components
 * prorate — are pinned down explicitly.
 */

import {
  computePayslip,
  workingDaysInMonth,
  type SalaryComponentSpec,
} from "../src/lib/payroll";
import {
  availableBalance,
  countLeaveDays,
  validateLeaveRequest,
} from "../src/lib/leave";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

/** The structure the seed installs. */
const STRUCTURE: SalaryComponentSpec[] = [
  { name: "Basic", kind: "EARNING", calculation: "FIXED", value: 0, sequence: 1 },
  { name: "House Rent Allowance", kind: "EARNING", calculation: "PERCENT_OF_BASIC", value: 40, sequence: 2 },
  { name: "Dearness Allowance", kind: "EARNING", calculation: "PERCENT_OF_BASIC", value: 15, sequence: 3 },
  { name: "Conveyance", kind: "EARNING", calculation: "FIXED", value: 1600, sequence: 4 },
  { name: "Provident Fund", kind: "DEDUCTION", calculation: "PERCENT_OF_BASIC", value: 12, sequence: 5 },
  { name: "Professional Tax", kind: "DEDUCTION", calculation: "FIXED", value: 200, sequence: 6 },
];

console.log("\n— payroll: a full month —");
{
  const slip = computePayslip({ basicSalary: 41000, components: STRUCTURE });

  // 41000 + 16400 (40%) + 6150 (15%) + 1600 = 65150
  check("gross sums the earning components", slip.grossEarnings === 65150, `${slip.grossEarnings}`);
  // 4920 (12% PF) + 200 = 5120
  check("deductions sum correctly", slip.totalDeductions === 5120, `${slip.totalDeductions}`);
  check("net pay is gross less deductions", slip.netPay === 60030, `${slip.netPay}`);
  check(
    "the Basic line takes its amount from the assignment, not the structure",
    slip.lines.find((line) => line.name === "Basic")?.amount === 41000,
    "the structure stores a placeholder of 0",
  );
  check("every component produces a line", slip.lines.length === STRUCTURE.length);
}

console.log("\n— payroll: loss of pay —");
{
  const slip = computePayslip({
    basicSalary: 30000,
    components: STRUCTURE,
    workingDays: 30,
    lopDays: 3,
  });
  const full = computePayslip({ basicSalary: 30000, components: STRUCTURE });

  check("paid days are working days less LOP", slip.paidDays === 27);
  check(
    "earnings are prorated by paid days",
    Math.abs(slip.grossEarnings - full.grossEarnings * (27 / 30)) < 0.05,
    `${slip.grossEarnings} vs ${full.grossEarnings}`,
  );
  check(
    "deductions are NOT prorated by unpaid leave",
    slip.totalDeductions === full.totalDeductions,
    "professional tax does not shrink because leave was unpaid",
  );

  const allLop = computePayslip({
    basicSalary: 30000,
    components: STRUCTURE,
    workingDays: 30,
    lopDays: 30,
  });
  check("a full month of LOP earns nothing", allLop.grossEarnings === 0);
  check(
    "net pay floors at zero rather than going negative",
    allLop.netPay === 0,
    "the school does not bill an employee for attending",
  );

  const overLop = computePayslip({
    basicSalary: 30000,
    components: STRUCTURE,
    workingDays: 30,
    lopDays: 45,
  });
  check("LOP beyond the month is clamped", overLop.paidDays === 0);
}

console.log("\n— payroll: percent of gross —");
{
  const withGross: SalaryComponentSpec[] = [
    { name: "Basic", kind: "EARNING", calculation: "FIXED", value: 0, sequence: 1 },
    { name: "Special Allowance", kind: "EARNING", calculation: "PERCENT_OF_GROSS", value: 10, sequence: 2 },
    { name: "Insurance", kind: "DEDUCTION", calculation: "PERCENT_OF_GROSS", value: 2, sequence: 3 },
  ];
  const slip = computePayslip({ basicSalary: 50000, components: withGross });

  check(
    "percent-of-gross is computed from the base gross, not from itself",
    slip.lines.find((line) => line.name === "Special Allowance")?.amount === 5000,
    "10% of 50000, avoiding a circular definition",
  );
  check(
    "a percent-of-gross deduction uses the same base",
    slip.lines.find((line) => line.name === "Insurance")?.amount === 1000,
  );
  check("gross includes the percent-of-gross earning", slip.grossEarnings === 55000, `${slip.grossEarnings}`);
}

console.log("\n— payroll: employer contributions —");
{
  const withEmployer: SalaryComponentSpec[] = [
    ...STRUCTURE,
    { name: "Employer PF", kind: "EMPLOYER_CONTRIBUTION", calculation: "PERCENT_OF_BASIC", value: 12, sequence: 7 },
  ];
  const slip = computePayslip({ basicSalary: 41000, components: withEmployer });

  check("employer contributions are tracked", slip.employerContributions === 4920);
  check(
    "employer contributions do not reduce take-home pay",
    slip.netPay === 60030,
    "they are a cost to the school, not a deduction from the employee",
  );
}

console.log("\n— payroll: working days —");
{
  // August 2026: 31 days, 5 Sundays.
  const days = workingDaysInMonth(2026, 8);
  check("Sundays are excluded", days === 26, `${days} working days in Aug 2026`);

  const withHoliday = workingDaysInMonth(2026, 8, [new Date("2026-08-15T00:00:00Z")]);
  check(
    "a declared holiday is excluded",
    withHoliday === 25,
    "15 Aug 2026 is a Saturday, so it still reduces the count",
  );
}

console.log("\n— leave: day counting —");
{
  // Mon 17 Aug 2026 to Wed 19 Aug 2026.
  const three = countLeaveDays(
    new Date("2026-08-17T00:00:00Z"),
    new Date("2026-08-19T00:00:00Z"),
  );
  check("an inclusive range counts both ends", three === 3, `${three} days`);

  // Fri 21 Aug to Mon 24 Aug — the Sunday must not be charged.
  const spanning = countLeaveDays(
    new Date("2026-08-21T00:00:00Z"),
    new Date("2026-08-24T00:00:00Z"),
  );
  check(
    "a weekend inside the range is not charged",
    spanning === 3,
    "Fri, Sat, Mon — Sunday excluded",
  );

  const withHoliday = countLeaveDays(
    new Date("2026-08-17T00:00:00Z"),
    new Date("2026-08-19T00:00:00Z"),
    { holidays: [new Date("2026-08-18T00:00:00Z")] },
  );
  check("a declared holiday inside the range is not charged", withHoliday === 2);

  const half = countLeaveDays(
    new Date("2026-08-17T00:00:00Z"),
    new Date("2026-08-17T00:00:00Z"),
    { halfDay: true },
  );
  check("a single-day half leave counts as 0.5", half === 0.5);

  const reversed = countLeaveDays(
    new Date("2026-08-19T00:00:00Z"),
    new Date("2026-08-17T00:00:00Z"),
  );
  check("a reversed range counts zero", reversed === 0);
}

console.log("\n— leave: validation —");
{
  const balance = { allocated: 12, used: 9, carried: 0 };
  check("available balance subtracts used days", availableBalance(balance) === 3);

  const ok = validateLeaveRequest({
    fromDate: new Date("2026-08-17T00:00:00Z"),
    toDate: new Date("2026-08-19T00:00:00Z"),
    balance,
  });
  check("a request within balance is accepted", ok.ok && ok.days === 3);

  const tooLong = validateLeaveRequest({
    fromDate: new Date("2026-08-17T00:00:00Z"),
    toDate: new Date("2026-08-21T00:00:00Z"),
    balance,
  });
  check(
    "a paid request beyond the balance is refused",
    !tooLong.ok,
    tooLong.reason,
  );

  const unpaid = validateLeaveRequest({
    fromDate: new Date("2026-08-17T00:00:00Z"),
    toDate: new Date("2026-08-21T00:00:00Z"),
    balance,
    isPaid: false,
  });
  check(
    "an unpaid type may exceed the balance",
    unpaid.ok,
    "that is precisely what loss of pay is",
  );

  const backwards = validateLeaveRequest({
    fromDate: new Date("2026-08-19T00:00:00Z"),
    toDate: new Date("2026-08-17T00:00:00Z"),
  });
  check("an end date before the start is refused", !backwards.ok, backwards.reason);

  const allHolidays = validateLeaveRequest({
    fromDate: new Date("2026-08-22T00:00:00Z"),
    toDate: new Date("2026-08-23T00:00:00Z"),
    holidays: [new Date("2026-08-22T00:00:00Z")],
  });
  check(
    "a range entirely on offs and holidays is refused",
    !allHolidays.ok,
    allHolidays.reason,
  );
}

console.log(
  failures === 0
    ? "\nAll payroll and leave checks passed.\n"
    : `\n${failures} HR check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
