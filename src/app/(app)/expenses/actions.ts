"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const Schema = z.object({
  category: z.string().trim().min(2, "Choose or type a category").max(80),
  description: z.string().trim().max(500).optional(),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  taxAmount: z.coerce.number().min(0, "Tax cannot be negative").optional(),
  paidTo: z.string().trim().max(160).optional(),
  paidAt: z.string().min(1, "Choose a date"),
  mode: z.enum([
    "CASH", "CHEQUE", "DEMAND_DRAFT", "UPI", "CARD",
    "NETBANKING", "WALLET", "BANK_TRANSFER", "ADJUSTMENT",
  ]),
  referenceNo: z.string().trim().max(80).optional(),
});

/** Records an expense voucher, numbering it per school. */
export async function recordExpense(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("expenses.manage");
  const db = scopedDb(session.schoolId);

  const paidAt = new Date(parsed.data.paidAt);
  if (paidAt.getTime() > Date.now() + 86400000) {
    // A voucher dated in the future would inflate today's spend reporting.
    return { ok: false, message: "An expense cannot be dated in the future.", values: raw };
  }

  const count = await db.expense.count();
  const voucherNo = `EXP${String(count + 1).padStart(5, "0")}`;

  const expense = await db.expense.create({
    data: {
      schoolId: session.schoolId,
      voucherNo,
      category: parsed.data.category,
      description: parsed.data.description || null,
      amount: parsed.data.amount,
      taxAmount: parsed.data.taxAmount ?? 0,
      paidTo: parsed.data.paidTo || null,
      paidAt,
      mode: parsed.data.mode,
      referenceNo: parsed.data.referenceNo || null,
      approvedBy: session.staffId ?? null,
    },
    select: { id: true, voucherNo: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "expenses.create",
    entityType: "Expense",
    entityId: expense.id,
    after: { voucherNo, amount: parsed.data.amount, category: parsed.data.category },
  });

  revalidatePath("/expenses");
  return { ok: true, message: `Voucher ${expense.voucherNo} recorded.` };
}
