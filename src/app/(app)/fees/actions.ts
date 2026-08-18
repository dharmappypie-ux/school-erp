"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { Prisma } from "@/lib/db";
import {
  allocateAcrossInvoices,
  invoiceStatusFor,
  nextDocumentNumber,
} from "@/lib/fees";
import { queueNotification } from "@/lib/notifications";
import { scopedDb } from "@/lib/tenant";

const CollectSchema = z.object({
  studentId: z.string().min(1),
  amount: z.coerce.number().positive("Enter an amount greater than zero"),
  mode: z.enum([
    "CASH", "CHEQUE", "DEMAND_DRAFT", "UPI", "CARD",
    "NETBANKING", "WALLET", "BANK_TRANSFER", "ADJUSTMENT",
  ]),
  reference: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
});

export interface CollectResult {
  ok: boolean;
  message: string;
  receiptNo?: string;
}

/**
 * Records an offline payment and settles it against the student's open
 * invoices, oldest first. Everything runs in one transaction so a receipt can
 * never exist without its allocations, or vice versa.
 */
export async function collectPayment(
  _previous: CollectResult,
  formData: FormData,
): Promise<CollectResult> {
  const parsed = CollectSchema.safeParse({
    studentId: formData.get("studentId"),
    amount: formData.get("amount"),
    mode: formData.get("mode"),
    reference: formData.get("reference"),
    remarks: formData.get("remarks"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("fees.collect");
  const db = scopedDb(session.schoolId);
  const { studentId, amount, mode, reference, remarks } = parsed.data;

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      id: true, firstName: true, lastName: true, admissionNo: true,
      guardians: {
        where: { isFeePayer: true },
        take: 1,
        select: { guardian: { select: { phone: true, email: true, userId: true } } },
      },
    },
  });
  if (!student) {
    return { ok: false, message: "Student not found in your school." };
  }

  const openInvoices = await db.invoice.findMany({
    where: {
      studentId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      amountDue: { gt: 0 },
    },
    orderBy: { dueDate: "asc" },
    select: { id: true, amountDue: true, total: true, amountPaid: true, dueDate: true },
  });

  if (openInvoices.length === 0) {
    return { ok: false, message: "This student has no outstanding invoices." };
  }

  const payable = new Prisma.Decimal(amount);
  const { allocations, unallocated } = allocateAcrossInvoices(payable, openInvoices);

  if (allocations.length === 0) {
    return { ok: false, message: "Nothing to allocate against." };
  }

  const receiptNo = await nextDocumentNumber(
    db, "receipt", `RCP${session.school.slug.slice(0, 3).toUpperCase()}`,
  );

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
        data: {
          paymentId: payment.id,
          invoiceId: allocation.invoiceId,
          amount: allocation.amount,
        },
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
    schoolId: session.schoolId,
    userId: session.userId,
    action: "fees.collect",
    entityType: "Payment",
    entityId: receiptNo,
    after: {
      studentId, amount: applied.toString(), mode,
      invoices: allocations.map((allocation) => allocation.invoiceId),
    },
  });

  // Receipt confirmation to the fee payer. Queued, not sent inline, so a slow
  // provider never delays the cashier's screen.
  const payer = student.guardians[0]?.guardian;
  if (payer) {
    await queueNotification({
      schoolId: session.schoolId,
      templateKey: "payment_receipt",
      channel: "EMAIL",
      recipient: payer.email ?? payer.phone,
      userId: payer.userId,
      variables: {
        receiptNo,
        amount: applied.toString(),
        studentName: `${student.firstName} ${student.lastName ?? ""}`.trim(),
        schoolName: session.school.name,
      },
    });
  }

  revalidatePath("/fees");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/dashboard");

  return {
    ok: true,
    receiptNo,
    message: unallocated.greaterThan(0)
      ? `Receipt ${receiptNo} issued for ${applied.toString()}. ${unallocated.toString()} was not applied — the outstanding balance was smaller than the amount tendered.`
      : `Receipt ${receiptNo} issued and applied across ${allocations.length} invoice(s).`,
  };
}
