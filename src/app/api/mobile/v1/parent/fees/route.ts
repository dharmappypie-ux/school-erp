import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { resolveStudentId } from "@/lib/mobile-portal";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/parent/fees
 *
 * The child's fee record: totals, every non-draft invoice with its line items,
 * and the receipts issued to date — the mobile mirror of /portal/fees.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  const studentId = await resolveStudentId(db, session.studentId, session.guardianId);
  if (!studentId) return cors(NextResponse.json({ invoices: [], payments: [], billed: 0, paid: 0, outstanding: 0 }));

  const [totals, invoices, payments] = await Promise.all([
    db.invoice.aggregate({
      where: { studentId, ...(yearId ? { academicYearId: yearId } : {}) },
      _sum: { total: true, amountPaid: true, amountDue: true },
    }),
    db.invoice.findMany({
      where: { studentId, status: { not: "DRAFT" } },
      orderBy: { dueDate: "desc" },
      select: {
        id: true, invoiceNo: true, period: true, status: true,
        issueDate: true, dueDate: true, total: true, amountPaid: true, amountDue: true,
        lines: {
          orderBy: { description: "asc" },
          select: { id: true, description: true, lineTotal: true },
        },
      },
    }),
    db.payment.findMany({
      where: { studentId, status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      take: 20,
      select: { id: true, receiptNo: true, amount: true, mode: true, paidAt: true, transactionRef: true },
    }),
  ]);

  const now = new Date();

  return cors(NextResponse.json({
    currency: "INR",
    billed: toNumber(totals._sum.total),
    paid: toNumber(totals._sum.amountPaid),
    outstanding: toNumber(totals._sum.amountDue),
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      period: i.period,
      status: i.status,
      overdue: toNumber(i.amountDue) > 0 && i.dueDate < now,
      issueDate: i.issueDate.toISOString(),
      dueDate: i.dueDate.toISOString(),
      total: toNumber(i.total),
      amountPaid: toNumber(i.amountPaid),
      amountDue: toNumber(i.amountDue),
      lines: i.lines.map((l) => ({ id: l.id, description: l.description, amount: toNumber(l.lineTotal) })),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      amount: toNumber(p.amount),
      mode: p.mode,
      paidAt: p.paidAt?.toISOString() ?? null,
      transactionRef: p.transactionRef,
    })),
  }));
}
