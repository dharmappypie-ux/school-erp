import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { computePayslip, workingDaysInMonth } from "@/lib/payroll";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

/**
 * POST /api/mobile/v1/admin/payroll/run
 *
 * Generates (or recomputes) DRAFT payslips for a month/year across active staff
 * with a salary structure — the mobile mirror of the web `runPayroll`. Already
 * PAID payslips are left untouched. Gated on payroll.manage.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "payroll.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: "Choose a valid month and year." }, { status: 400 }));
  }
  const { month, year } = parsed.data;

  const db = scopedDb(session.schoolId);
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0));

  const [staff, holidays] = await Promise.all([
    db.staffMember.findMany({
      where: { employmentStatus: "ACTIVE", deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true,
        salaryAssignments: {
          where: { effectiveFrom: { lte: periodEnd } },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          include: { structure: { select: { name: true, components: { orderBy: { sequence: "asc" } } } } },
        },
      },
    }),
    db.holiday.findMany({
      where: { date: { gte: periodStart, lte: periodEnd } },
      select: { date: true },
    }),
  ]);

  const workingDays = workingDaysInMonth(year, month, holidays.map((h) => h.date));

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
    lopByStaff.set(leave.staffId, (lopByStaff.get(leave.staffId) ?? 0) + toNumber(leave.days));
  }

  let generated = 0;
  let skippedPaid = 0;
  let skippedNoSalary = 0;

  for (const member of staff) {
    const assignment = member.salaryAssignments[0];
    if (!assignment) { skippedNoSalary += 1; continue; }

    const existing = await db.payslip.findUnique({
      where: { staffId_month_year: { staffId: member.id, month, year } },
      select: { id: true, status: true },
    });
    if (existing?.status === "PAID") { skippedPaid += 1; continue; }

    const result = computePayslip({
      basicSalary: toNumber(assignment.basicSalary),
      components: assignment.structure.components.map((c) => ({
        name: c.name,
        kind: c.kind as "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION",
        calculation: c.calculation as "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS",
        value: toNumber(c.value),
        sequence: c.sequence,
      })),
      workingDays,
      lopDays: lopByStaff.get(member.id) ?? 0,
    });

    await db.$transaction(async (tx) => {
      const payslip = await tx.payslip.upsert({
        where: { staffId_month_year: { staffId: member.id, month, year } },
        create: {
          schoolId: session.schoolId, staffId: member.id, month, year,
          grossEarnings: result.grossEarnings, totalDeductions: result.totalDeductions,
          netPay: result.netPay, workingDays: result.workingDays, paidDays: result.paidDays,
          lopDays: result.lopDays, status: "DRAFT",
        },
        update: {
          grossEarnings: result.grossEarnings, totalDeductions: result.totalDeductions,
          netPay: result.netPay, workingDays: result.workingDays, paidDays: result.paidDays,
          lopDays: result.lopDays,
        },
        select: { id: true },
      });
      await tx.payslipLine.deleteMany({ where: { payslipId: payslip.id } });
      await tx.payslipLine.createMany({
        data: result.lines.map((line, index) => ({
          payslipId: payslip.id, name: line.name, kind: line.kind, amount: line.amount, sequence: index,
        })),
      });
    });
    generated += 1;
  }

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "payroll.run", entityType: "Payslip",
    entityId: `${year}-${String(month).padStart(2, "0")}`,
    after: { generated, skippedPaid, skippedNoSalary, workingDays, via: "mobile" },
  });

  const notes: string[] = [];
  if (skippedPaid > 0) notes.push(`${skippedPaid} already paid and left untouched`);
  if (skippedNoSalary > 0) notes.push(`${skippedNoSalary} have no salary assigned`);

  return cors(NextResponse.json({
    ok: generated > 0,
    generated, skippedPaid, skippedNoSalary, workingDays,
    message: generated === 0
      ? `No payslips generated. ${notes.join("; ") || "No active staff with a salary structure."}`
      : `Generated ${generated} payslips over ${workingDays} working days${notes.length ? ` — ${notes.join("; ")}` : ""}.`,
  }));
}
