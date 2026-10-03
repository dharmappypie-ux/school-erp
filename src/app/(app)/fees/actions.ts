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

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const GenerateSchema = z.object({
  structureId: z.string().min(1, "Choose a fee structure"),
  dueDate: z.string().optional(),
  period: z.string().trim().max(40).optional(),
});

/**
 * Bills every active student covered by a fee structure: one invoice per
 * student, with a line per structure item. Students who already have an invoice
 * from this structure are skipped, so re-running never double-bills. All the
 * invoices are written in one transaction — a half-billed class is worse than
 * an error the admin can retry.
 */
export async function generateInvoices(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = GenerateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("fees.invoice");
  const yearId = session.academicYear?.id;
  if (!yearId) {
    return { ok: false, message: "Set up a current academic year first.", values: raw };
  }
  const db = scopedDb(session.schoolId);

  const structure = await db.feeStructure.findUnique({
    where: { id: parsed.data.structureId },
    select: {
      id: true,
      name: true,
      classLevelId: true,
      academicYearId: true,
      items: {
        select: {
          amount: true,
          installment: true,
          label: true,
          dueDate: true,
          feeCategory: {
            select: { id: true, name: true, taxRate: true, isTaxable: true },
          },
        },
      },
    },
  });
  if (!structure) {
    return { ok: false, message: "That fee structure does not exist.", values: raw };
  }
  // Invoices are stamped with the current year, so a structure from a past
  // session must not be billed against it.
  if (structure.academicYearId !== yearId) {
    return {
      ok: false,
      message: `"${structure.name}" belongs to a different academic year and cannot be billed against the current one.`,
      values: raw,
    };
  }
  if (structure.items.length === 0) {
    return { ok: false, message: `"${structure.name}" has no fee heads to bill.`, values: raw };
  }

  // Who to bill: active enrollments this year, narrowed to the structure's
  // class level when it has one (otherwise the whole school).
  const enrollments = await db.enrollment.findMany({
    where: {
      academicYearId: yearId,
      isActive: true,
      ...(structure.classLevelId
        ? { section: { classLevelId: structure.classLevelId } }
        : {}),
    },
    select: { studentId: true },
  });
  const candidateIds = [...new Set(enrollments.map((row) => row.studentId))];
  if (candidateIds.length === 0) {
    return { ok: false, message: "No active students match this structure.", values: raw };
  }

  // Skip students already billed from this structure so a re-run is safe.
  const alreadyBilled = await db.invoice.findMany({
    where: { structureId: structure.id, studentId: { in: candidateIds } },
    select: { studentId: true },
  });
  const billedSet = new Set(alreadyBilled.map((row) => row.studentId));
  const targetIds = candidateIds.filter((id) => !billedSet.has(id));
  if (targetIds.length === 0) {
    return {
      ok: false,
      message: `Every matching student already has an invoice from "${structure.name}".`,
      values: raw,
    };
  }

  // Per-invoice totals are identical across students, so compute the lines
  // once. Everything is rounded to 2 dp up front, matching the Decimal(12,2)
  // columns, so the persisted line totals always sum to the invoice total
  // (otherwise per-column DB rounding could leave them off by a paisa).
  const round2 = (value: InstanceType<typeof Prisma.Decimal>) => value.toDecimalPlaces(2);
  const lineTemplates = structure.items.map((item) => {
    const amount = round2(new Prisma.Decimal(item.amount));
    const taxRate = item.feeCategory.isTaxable
      ? new Prisma.Decimal(item.feeCategory.taxRate ?? 0)
      : new Prisma.Decimal(0);
    const taxAmount = round2(amount.times(taxRate).dividedBy(100));
    return {
      feeCategoryId: item.feeCategory.id,
      description: item.label || item.feeCategory.name,
      amount,
      taxRate,
      taxAmount,
      lineTotal: amount.plus(taxAmount),
      installment: item.installment,
    };
  });
  const subtotal = lineTemplates.reduce((sum, line) => sum.plus(line.amount), new Prisma.Decimal(0));
  const taxTotal = lineTemplates.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0));
  const total = subtotal.plus(taxTotal);

  const dueDate =
    parsed.data.dueDate && parsed.data.dueDate.trim()
      ? new Date(parsed.data.dueDate)
      : (structure.items
          .map((item) => item.dueDate)
          .filter((date): date is Date => date !== null)
          .sort((a, b) => a.getTime() - b.getTime())[0] ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  if (Number.isNaN(dueDate.getTime())) {
    return { ok: false, message: "The due date could not be read.", values: raw };
  }

  const prefix = `INV${session.school.slug.slice(0, 3).toUpperCase()}`;
  const width = 5;

  try {
    await db.$transaction(async (tx) => {
      // Read the base number inside the transaction, so it reflects any rows a
      // just-committed batch added. A concurrent batch that still races to the
      // same number trips the unique constraint and is caught below.
      const first = await nextDocumentNumber(tx as typeof db, "invoice", prefix, width);
      const startNum = Number.parseInt(first.slice(prefix.length), 10) || 1;

      for (let i = 0; i < targetIds.length; i += 1) {
        const invoiceNo = `${prefix}${String(startNum + i).padStart(width, "0")}`;
        await tx.invoice.create({
          data: {
            schoolId: session.schoolId,
            studentId: targetIds[i],
            academicYearId: yearId,
            structureId: structure.id,
            invoiceNo,
            dueDate,
            period: parsed.data.period || null,
            subtotal,
            taxTotal,
            total,
            amountPaid: new Prisma.Decimal(0),
            amountDue: total,
            status: "ISSUED",
            lines: {
              create: lineTemplates.map((line) => ({
                feeCategoryId: line.feeCategoryId,
                description: line.description,
                amount: line.amount,
                taxRate: line.taxRate,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                installment: line.installment,
              })),
            },
          },
        });
      }
    });
  } catch (error) {
    // A unique-constraint clash means another invoice run raced this one; the
    // transaction rolled back cleanly, so nothing was half-billed.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        message: "Another invoice run happened at the same time. Nothing was billed — please try again.",
        values: raw,
      };
    }
    throw error;
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "fees.invoice.generate",
    entityType: "FeeStructure",
    entityId: structure.id,
    after: { structure: structure.name, count: targetIds.length, total: total.toString() },
  });

  revalidatePath("/fees");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${targetIds.length} invoice(s) issued from "${structure.name}" at ${total.toString()} each${
      billedSet.size > 0 ? ` (${billedSet.size} already billed, skipped)` : ""
    }.`,
  };
}

const RefundSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.coerce.number().positive("Enter an amount greater than zero"),
  reason: z.string().trim().min(3, "Give a reason for the refund").max(200),
});

/**
 * Refunds all or part of a payment. The refund reverses the payment's own
 * allocations proportionally so each invoice's paid/due figures and status are
 * corrected, and the payment is marked REFUNDED only when fully returned.
 * Everything is one transaction so invoices can never drift from the payment.
 */
export async function refundPayment(input: z.infer<typeof RefundSchema>): Promise<ActionResult> {
  const parsed = RefundSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("fees.refund");
  const db = scopedDb(session.schoolId);
  const { paymentId, amount, reason } = parsed.data;

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      studentId: true,
      receiptNo: true,
      amount: true,
      refundedAmount: true,
      status: true,
      allocations: {
        select: {
          amount: true,
          invoice: { select: { id: true, total: true, amountPaid: true, dueDate: true } },
        },
      },
    },
  });
  if (!payment) return { ok: false, message: "Payment not found in your school." };
  if (payment.status === "REFUNDED") {
    return { ok: false, message: "This payment has already been fully refunded." };
  }

  const paid = new Prisma.Decimal(payment.amount);
  const alreadyRefunded = new Prisma.Decimal(payment.refundedAmount);
  const refund = new Prisma.Decimal(amount);
  const remaining = paid.minus(alreadyRefunded);
  if (refund.greaterThan(remaining)) {
    return {
      ok: false,
      message: `Only ${remaining.toString()} of receipt ${payment.receiptNo} remains refundable.`,
    };
  }

  // Reverse the paid amount off each invoice in proportion to how this payment
  // was originally allocated, so no single invoice is over-credited.
  const allocatedTotal = payment.allocations.reduce(
    (sum, alloc) => sum.plus(new Prisma.Decimal(alloc.amount)),
    new Prisma.Decimal(0),
  );

  await db.$transaction(async (tx) => {
    if (allocatedTotal.greaterThan(0)) {
      let reversedSoFar = new Prisma.Decimal(0);
      for (let i = 0; i < payment.allocations.length; i += 1) {
        const alloc = payment.allocations[i];
        const invoice = alloc.invoice;
        // Last allocation absorbs the rounding remainder so the sum is exact.
        const isLast = i === payment.allocations.length - 1;
        const share = isLast
          ? refund.minus(reversedSoFar)
          : refund.times(new Prisma.Decimal(alloc.amount)).dividedBy(allocatedTotal);
        reversedSoFar = reversedSoFar.plus(share);

        const newPaid = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          new Prisma.Decimal(invoice.amountPaid).minus(share),
        );
        const total = new Prisma.Decimal(invoice.total);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: newPaid,
            amountDue: total.minus(newPaid),
            status: invoiceStatusFor(total, newPaid, invoice.dueDate),
          },
        });
      }
    }

    const totalRefunded = alreadyRefunded.plus(refund);
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: totalRefunded,
        refundedAt: new Date(),
        refundReason: reason,
        status: totalRefunded.greaterThanOrEqualTo(paid) ? "REFUNDED" : payment.status,
      },
    });
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "fees.refund",
    entityType: "Payment",
    entityId: payment.receiptNo,
    after: { amount: refund.toString(), reason },
  });

  revalidatePath("/fees");
  revalidatePath("/fees/payments");
  revalidatePath(`/fees/payments/${payment.id}`);
  revalidatePath(`/students/${payment.studentId}`);
  return {
    ok: true,
    message: `${refund.toString()} refunded against receipt ${payment.receiptNo}.`,
  };
}

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
