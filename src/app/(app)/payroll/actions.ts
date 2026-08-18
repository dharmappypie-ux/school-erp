"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { computePayslip, workingDaysInMonth } from "@/lib/payroll";
import { toNumber } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const RunSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

/**
 * Generates draft payslips for every active staff member with a salary.
 *
 * Payslips already marked PAID are never touched — reissuing one after the
 * money has left the bank would put the school's records out of step with its
 * statements. Drafts are recomputed freely.
 */
export async function runPayroll(
  input: z.infer<typeof RunSchema>,
): Promise<ActionResult> {
  const parsed = RunSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid month and year." };
  }

  const session = await requirePermission("payroll.manage");
  const db = scopedDb(session.schoolId);
  const { month, year } = parsed.data;

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0));

  const [staff, holidays] = await Promise.all([
    db.staffMember.findMany({
      where: { employmentStatus: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        salaryAssignments: {
          where: { effectiveFrom: { lte: periodEnd } },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          include: {
            structure: {
              select: { name: true, components: { orderBy: { sequence: "asc" } } },
            },
          },
        },
      },
    }),
    db.holiday.findMany({
      where: { date: { gte: periodStart, lte: periodEnd } },
      select: { date: true },
    }),
  ]);

  const workingDays = workingDaysInMonth(
    year,
    month,
    holidays.map((holiday) => holiday.date),
  );

  // Unpaid leave in the period drives the loss-of-pay proration.
  const lopLeave = await db.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      leaveType: { isPaid: false },
      fromDate: { lte: periodEnd },
      toDate: { gte: periodStart },
    },
    select: { staffId: true, days: true },
  });
  const lopByStaff = new Map<string, number>();
  for (const leave of lopLeave) {
    lopByStaff.set(
      leave.staffId,
      (lopByStaff.get(leave.staffId) ?? 0) + toNumber(leave.days),
    );
  }

  let generated = 0;
  let skippedPaid = 0;
  let skippedNoSalary = 0;

  for (const member of staff) {
    const assignment = member.salaryAssignments[0];
    if (!assignment) {
      skippedNoSalary += 1;
      continue;
    }

    const existing = await db.payslip.findUnique({
      where: { staffId_month_year: { staffId: member.id, month, year } },
      select: { id: true, status: true },
    });
    if (existing?.status === "PAID") {
      skippedPaid += 1;
      continue;
    }

    const result = computePayslip({
      basicSalary: toNumber(assignment.basicSalary),
      components: assignment.structure.components.map((component) => ({
        name: component.name,
        kind: component.kind as "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION",
        calculation: component.calculation as
          | "FIXED"
          | "PERCENT_OF_BASIC"
          | "PERCENT_OF_GROSS",
        value: toNumber(component.value),
        sequence: component.sequence,
      })),
      workingDays,
      lopDays: lopByStaff.get(member.id) ?? 0,
    });

    await db.$transaction(async (tx) => {
      const payslip = await tx.payslip.upsert({
        where: { staffId_month_year: { staffId: member.id, month, year } },
        create: {
          schoolId: session.schoolId,
          staffId: member.id,
          month,
          year,
          grossEarnings: result.grossEarnings,
          totalDeductions: result.totalDeductions,
          netPay: result.netPay,
          workingDays: result.workingDays,
          paidDays: result.paidDays,
          lopDays: result.lopDays,
          status: "DRAFT",
        },
        update: {
          grossEarnings: result.grossEarnings,
          totalDeductions: result.totalDeductions,
          netPay: result.netPay,
          workingDays: result.workingDays,
          paidDays: result.paidDays,
          lopDays: result.lopDays,
        },
        select: { id: true },
      });

      // Replace the lines so a changed structure does not leave stale rows.
      await tx.payslipLine.deleteMany({ where: { payslipId: payslip.id } });
      await tx.payslipLine.createMany({
        data: result.lines.map((line, index) => ({
          payslipId: payslip.id,
          name: line.name,
          kind: line.kind,
          amount: line.amount,
          sequence: index,
        })),
      });
    });

    generated += 1;
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "payroll.run",
    entityType: "Payslip",
    entityId: `${year}-${String(month).padStart(2, "0")}`,
    after: { generated, skippedPaid, skippedNoSalary, workingDays },
  });

  revalidatePath("/payroll");

  const notes: string[] = [];
  if (skippedPaid > 0) notes.push(`${skippedPaid} already paid and left untouched`);
  if (skippedNoSalary > 0) notes.push(`${skippedNoSalary} have no salary assigned`);

  return {
    ok: generated > 0,
    message:
      generated === 0
        ? `No payslips generated. ${notes.join("; ") || "No active staff with a salary structure."}`
        : `Generated ${generated} payslips over ${workingDays} working days${notes.length ? ` — ${notes.join("; ")}` : ""}.`,
  };
}

const MarkPaidSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

/** Marks the month's approved payslips as paid. */
export async function markPayrollPaid(
  input: z.infer<typeof MarkPaidSchema>,
): Promise<ActionResult> {
  const parsed = MarkPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a valid month." };

  const session = await requirePermission("payroll.manage");
  const db = scopedDb(session.schoolId);
  const { month, year } = parsed.data;

  const result = await db.payslip.updateMany({
    where: { month, year, status: { not: "PAID" } },
    data: { status: "PAID", paidOn: new Date() },
  });

  if (result.count === 0) {
    return { ok: false, message: "There are no unpaid payslips for that month." };
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "payroll.paid",
    entityType: "Payslip",
    entityId: `${year}-${String(month).padStart(2, "0")}`,
    after: { count: result.count },
  });

  revalidatePath("/payroll");
  return { ok: true, message: `Marked ${result.count} payslips as paid.` };
}
