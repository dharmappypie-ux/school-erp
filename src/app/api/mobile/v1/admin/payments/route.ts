import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const PAGE_SIZE = 40;

/**
 * GET /api/mobile/v1/admin/payments?q=&mode=&page=1
 *
 * The receipt ledger: every payment taken, newest first, with the month's
 * collection as a roll-up. This is the audit side of fee collection — taking a
 * payment is `admin/payment`, reading back what was taken is here.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["fees.report", "fees.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || null;
  const mode = url.searchParams.get("mode")?.trim() || null;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const where = {
    ...(mode ? { mode: mode as never } : {}),
    ...(q
      ? {
          OR: [
            { receiptNo: { contains: q, mode: "insensitive" as const } },
            { transactionRef: { contains: q, mode: "insensitive" as const } },
            { student: { is: { firstName: { contains: q, mode: "insensitive" as const } } } },
            { student: { is: { lastName: { contains: q, mode: "insensitive" as const } } } },
            { student: { is: { admissionNo: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [rows, total, monthAgg, byMode] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, receiptNo: true, amount: true, mode: true, status: true,
        paidAt: true, transactionRef: true, gateway: true, refundedAmount: true,
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
        allocations: { select: { invoice: { select: { invoiceNo: true } } } },
      },
    }),
    db.payment.count({ where }),
    db.payment.aggregate({
      // Bounded on both sides: an open-ended `gte` would also count payments
      // dated in the future.
      where: { status: "SUCCESS", paidAt: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.payment.groupBy({
      by: ["mode"],
      where: { status: "SUCCESS" },
      _sum: { amount: true },
    }),
  ]);

  return cors(NextResponse.json({
    total,
    page,
    pageSize: PAGE_SIZE,
    hasMore: page * PAGE_SIZE < total,
    month: {
      collected: toNumber(monthAgg._sum.amount ?? 0),
      count: monthAgg._count._all,
    },
    byMode: byMode.map((m) => ({
      mode: m.mode,
      total: toNumber(m._sum.amount ?? 0),
    })),
    payments: rows.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      amount: toNumber(p.amount),
      refunded: toNumber(p.refundedAmount ?? 0),
      mode: p.mode,
      status: p.status,
      gateway: p.gateway,
      transactionRef: p.transactionRef,
      paidAt: p.paidAt.toISOString(),
      student: `${p.student.firstName} ${p.student.lastName ?? ""}`.trim(),
      admissionNo: p.student.admissionNo,
      invoices: p.allocations.map((a) => a.invoice.invoiceNo),
    })),
  }));
}
