import "server-only";

import { Prisma } from "@/lib/db";
import type { ScopedDb } from "@/lib/tenant";

/**
 * Fee arithmetic shared by the collection UI, the payment gateway webhook and
 * the nightly late-fee job. Kept in one place so a receipt written by any of
 * them settles an invoice identically.
 */

export type Decimalish = Prisma.Decimal | number | string;

function decimal(value: Decimalish): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

export interface LateFeeRuleLike {
  graceDays: number;
  chargeType: string;
  amount: Decimalish;
  maxAmount: Decimalish | null;
}

/**
 * Late fee for one invoice as of `asOf`. Returns zero while the invoice is
 * within its grace period or already settled.
 */
export function computeLateFee(
  rule: LateFeeRuleLike,
  invoice: { dueDate: Date; amountDue: Decimalish },
  asOf: Date = new Date(),
): Prisma.Decimal {
  const due = decimal(invoice.amountDue);
  if (due.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);

  const daysLate = Math.floor(
    (asOf.getTime() - invoice.dueDate.getTime()) / 86400000,
  );
  const chargeableDays = daysLate - rule.graceDays;
  if (chargeableDays <= 0) return new Prisma.Decimal(0);

  let charge: Prisma.Decimal;
  switch (rule.chargeType) {
    case "PER_DAY":
      charge = decimal(rule.amount).times(chargeableDays);
      break;
    case "PERCENTAGE":
      charge = due.times(decimal(rule.amount)).dividedBy(100);
      break;
    default:
      charge = decimal(rule.amount);
  }

  if (rule.maxAmount !== null && rule.maxAmount !== undefined) {
    const cap = decimal(rule.maxAmount);
    if (charge.greaterThan(cap)) charge = cap;
  }

  return charge.toDecimalPlaces(2);
}

export function invoiceStatusFor(
  total: Prisma.Decimal,
  paid: Prisma.Decimal,
  dueDate: Date,
  asOf: Date = new Date(),
): "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "ISSUED" {
  if (paid.greaterThanOrEqualTo(total)) return "PAID";
  if (paid.greaterThan(0)) return "PARTIALLY_PAID";
  return dueDate < asOf ? "OVERDUE" : "ISSUED";
}

/**
 * Applies `amount` across the student's open invoices, oldest due date first,
 * and returns the per-invoice split. Any remainder is left unallocated so the
 * caller can decide whether to hold it as an advance.
 */
export function allocateAcrossInvoices(
  amount: Prisma.Decimal,
  invoices: { id: string; amountDue: Decimalish }[],
): { allocations: { invoiceId: string; amount: Prisma.Decimal }[]; unallocated: Prisma.Decimal } {
  let remaining = amount;
  const allocations: { invoiceId: string; amount: Prisma.Decimal }[] = [];

  for (const invoice of invoices) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const due = decimal(invoice.amountDue);
    if (due.lessThanOrEqualTo(0)) continue;

    const applied = remaining.greaterThan(due) ? due : remaining;
    allocations.push({ invoiceId: invoice.id, amount: applied });
    remaining = remaining.minus(applied);
  }

  return { allocations, unallocated: remaining };
}

/**
 * Generates the next sequential document number for a tenant, e.g. RCP00042.
 *
 * Reads the highest existing number rather than keeping a counter table, so it
 * stays correct if rows are imported. Call inside a transaction when two
 * requests could collide.
 */
export async function nextDocumentNumber(
  db: ScopedDb,
  kind: "invoice" | "receipt" | "voucher",
  prefix: string,
  width = 5,
): Promise<string> {
  const latest =
    kind === "invoice"
      ? await db.invoice.findFirst({
          where: { invoiceNo: { startsWith: prefix } },
          orderBy: { invoiceNo: "desc" },
          select: { invoiceNo: true },
        })
      : kind === "receipt"
        ? await db.payment.findFirst({
            where: { receiptNo: { startsWith: prefix } },
            orderBy: { receiptNo: "desc" },
            select: { receiptNo: true },
          })
        : await db.expense.findFirst({
            where: { voucherNo: { startsWith: prefix } },
            orderBy: { voucherNo: "desc" },
            select: { voucherNo: true },
          });

  const current =
    latest && "invoiceNo" in latest ? latest.invoiceNo
    : latest && "receiptNo" in latest ? latest.receiptNo
    : latest && "voucherNo" in latest ? latest.voucherNo
    : null;

  const sequence = current
    ? Number.parseInt(current.slice(prefix.length), 10) + 1
    : 1;

  return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(width, "0")}`;
}
