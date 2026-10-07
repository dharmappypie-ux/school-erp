import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { Prisma } from "@/lib/db";
import { invoiceStatusFor } from "@/lib/fees";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  paymentId: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  reason: z.string().trim().min(3, "Give a reason for the refund").max(200),
});

/**
 * POST /api/mobile/v1/admin/payment/refund — refund (part of) a receipt,
 * reversing the paid amount across its invoices in proportion. Mirrors the web
 * `refundPayment`.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "fees.refund");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const refundAmt = Number(parsed.data.amount);
  if (!Number.isFinite(refundAmt) || refundAmt <= 0) {
    return cors(NextResponse.json({ error: "Enter a valid refund amount." }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const payment = await db.payment.findUnique({
    where: { id: parsed.data.paymentId },
    select: {
      id: true, receiptNo: true, amount: true, refundedAmount: true, status: true,
      allocations: { select: { amount: true, invoice: { select: { id: true, total: true, amountPaid: true, dueDate: true } } } },
    },
  });
  if (!payment) return cors(NextResponse.json({ error: "Payment not found in your school." }, { status: 404 }));
  if (payment.status === "REFUNDED") {
    return cors(NextResponse.json({ error: "This payment has already been fully refunded." }, { status: 409 }));
  }

  const paid = new Prisma.Decimal(payment.amount);
  const alreadyRefunded = new Prisma.Decimal(payment.refundedAmount);
  const refund = new Prisma.Decimal(refundAmt);
  const remaining = paid.minus(alreadyRefunded);
  if (refund.greaterThan(remaining)) {
    return cors(NextResponse.json({ error: `Only ₹${remaining.toString()} of receipt ${payment.receiptNo} remains refundable.` }, { status: 400 }));
  }

  const allocatedTotal = payment.allocations.reduce((s, a) => s.plus(new Prisma.Decimal(a.amount)), new Prisma.Decimal(0));

  await db.$transaction(async (tx) => {
    if (allocatedTotal.greaterThan(0)) {
      let reversedSoFar = new Prisma.Decimal(0);
      for (let i = 0; i < payment.allocations.length; i += 1) {
        const alloc = payment.allocations[i];
        const invoice = alloc.invoice;
        const isLast = i === payment.allocations.length - 1;
        const share = isLast ? refund.minus(reversedSoFar) : refund.times(new Prisma.Decimal(alloc.amount)).dividedBy(allocatedTotal);
        reversedSoFar = reversedSoFar.plus(share);
        const newPaid = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(invoice.amountPaid).minus(share));
        const total = new Prisma.Decimal(invoice.total);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid: newPaid, amountDue: total.minus(newPaid), status: invoiceStatusFor(total, newPaid, invoice.dueDate) },
        });
      }
    }
    const totalRefunded = alreadyRefunded.plus(refund);
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: totalRefunded, refundedAt: new Date(), refundReason: parsed.data.reason,
        status: totalRefunded.greaterThanOrEqualTo(paid) ? "REFUNDED" : payment.status,
      },
    });
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "fees.refund", entityType: "Payment", entityId: payment.receiptNo,
    after: { amount: refund.toString(), reason: parsed.data.reason, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `₹${refund.toString()} refunded against receipt ${payment.receiptNo}.` }));
}
