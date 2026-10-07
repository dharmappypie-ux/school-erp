import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { Prisma, prisma } from "@/lib/db";
import { allocateAcrossInvoices, invoiceStatusFor, nextDocumentNumber } from "@/lib/fees";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/payment — recent receipts, for refunds. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["fees.refund", "fees.read", "fees.collect"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.payment.findMany({
    orderBy: { paidAt: "desc" },
    take: 80,
    select: {
      id: true, receiptNo: true, amount: true, refundedAmount: true, status: true, mode: true,
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
  });

  return cors(NextResponse.json({
    items: rows.map((p) => {
      const amt = Number(p.amount);
      const refunded = Number(p.refundedAmount);
      return {
        id: p.id,
        receiptNo: p.receiptNo,
        studentName: `${p.student.firstName} ${p.student.lastName ?? ""}`.trim(),
        admissionNo: p.student.admissionNo,
        amount: amt,
        refundedAmount: refunded,
        refundable: Math.max(0, amt - refunded),
        status: p.status,
        mode: p.mode,
      };
    }),
  }));
}

const Schema = z.object({
  studentId: z.string().trim().min(1, "Pick a student"),
  amount: z.union([z.string(), z.number()]),
  mode: z.enum(["CASH", "CHEQUE", "UPI", "CARD", "NETBANKING", "BANK_TRANSFER"]).optional(),
  reference: z.string().trim().max(120).optional(),
  remarks: z.string().trim().max(500).optional(),
});

/** POST /api/mobile/v1/admin/payment — collect a fee payment, oldest invoice first. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "fees.collect");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return cors(NextResponse.json({ error: "Enter a valid amount." }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const { studentId, reference, remarks } = parsed.data;
  const mode = parsed.data.mode ?? "CASH";

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) {
    return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));
  }

  const openInvoices = await db.invoice.findMany({
    where: { studentId, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] }, amountDue: { gt: 0 } },
    orderBy: { dueDate: "asc" },
    select: { id: true, amountDue: true, total: true, amountPaid: true, dueDate: true },
  });
  if (openInvoices.length === 0) {
    return cors(NextResponse.json({ error: "This student has no outstanding invoices." }, { status: 400 }));
  }

  const payable = new Prisma.Decimal(amount);
  const { allocations, unallocated } = allocateAcrossInvoices(payable, openInvoices);
  if (allocations.length === 0) {
    return cors(NextResponse.json({ error: "Nothing to allocate against." }, { status: 400 }));
  }

  const school = await prisma.school.findUnique({ where: { id: session.schoolId }, select: { slug: true } });
  const prefix = `RCP${(school?.slug ?? "sch").slice(0, 3).toUpperCase()}`;
  const receiptNo = await nextDocumentNumber(db, "receipt", prefix);
  const applied = payable.minus(unallocated);

  await db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        schoolId: session.schoolId,
        studentId,
        receiptNo,
        amount: applied,
        mode,
        status: "SUCCESS",
        paidAt: new Date(),
        transactionRef: reference || null,
        remarks: remarks || null,
        collectedBy: session.userId,
      },
    });

    for (const allocation of allocations) {
      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, invoiceId: allocation.invoiceId, amount: allocation.amount },
      });
      const invoice = openInvoices.find((row) => row.id === allocation.invoiceId)!;
      const newPaid = new Prisma.Decimal(invoice.amountPaid).plus(allocation.amount);
      const total = new Prisma.Decimal(invoice.total);
      await tx.invoice.update({
        where: { id: allocation.invoiceId },
        data: {
          amountPaid: newPaid,
          amountDue: total.minus(newPaid),
          status: invoiceStatusFor(total, newPaid, invoice.dueDate),
        },
      });
    }
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "fees.collect", entityType: "Payment", entityId: receiptNo,
    after: { studentId, amount: applied.toString(), mode, via: "mobile", invoices: allocations.map((a) => a.invoiceId) },
  });

  return cors(NextResponse.json({
    ok: true,
    receiptNo,
    message: unallocated.greaterThan(0)
      ? `Receipt ${receiptNo} issued for ₹${applied.toString()}. ₹${unallocated.toString()} was left unapplied (balance was smaller than the amount paid).`
      : `Receipt ${receiptNo} issued and applied across ${allocations.length} invoice(s).`,
  }));
}
