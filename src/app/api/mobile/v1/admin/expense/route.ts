import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  category: z.string().trim().min(1, "Choose a category"),
  amount: z.union([z.string(), z.number()]),
  description: z.string().trim().max(500).optional(),
  paidTo: z.string().trim().max(200).optional(),
  mode: z.enum(["CASH", "CHEQUE", "UPI", "CARD", "NETBANKING", "BANK_TRANSFER"]).optional(),
});

/** POST /api/mobile/v1/admin/expense — record a school expense. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "expenses.manage");
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
  const latest = await db.expense.findFirst({
    where: { voucherNo: { startsWith: "EXP" } },
    orderBy: { voucherNo: "desc" },
    select: { voucherNo: true },
  });
  const seq = latest ? Number.parseInt(latest.voucherNo.replace(/\D/g, ""), 10) + 1 : 1;
  const voucherNo = `EXP${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;

  const expense = await db.expense.create({
    data: {
      schoolId: session.schoolId,
      voucherNo,
      category: parsed.data.category,
      description: parsed.data.description || null,
      amount,
      paidTo: parsed.data.paidTo || null,
      mode: parsed.data.mode ?? "BANK_TRANSFER",
      paidAt: new Date(),
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "expenses.create", entityType: "Expense", entityId: expense.id,
    after: { voucherNo, category: parsed.data.category, amount, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, voucherNo, message: `Expense ${voucherNo} recorded.` }));
}
