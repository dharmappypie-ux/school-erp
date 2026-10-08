import { NextResponse } from "next/server";

import { Prisma } from "@/lib/db";
import { invoiceStatusFor } from "@/lib/fees";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * POST /api/mobile/v1/admin/cleanup-qa2 — TEMPORARY. Removes the last QA test
 * artifacts in the caller's school: chat messages containing "QATEST", the test
 * expense EXP0034, and the ₹100 test receipt RCPGRE00002 (reversing its invoice
 * allocation first so balances stay correct). Super-admin only. Remove after use.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  if (!session.permissions.includes("*")) {
    return cors(NextResponse.json({ error: "Super admin only." }, { status: 403 }));
  }

  const db = scopedDb(session.schoolId);
  const out: Record<string, unknown> = {};

  // 1) Messages containing QATEST, then any threads left empty.
  try {
    const msgs = await db.message.deleteMany({ where: { body: { contains: "QATEST" } } });
    const empty = await db.messageThread.findMany({ where: { messages: { none: {} } }, select: { id: true } });
    const threads = empty.length ? await db.messageThread.deleteMany({ where: { id: { in: empty.map((t) => t.id) } } }) : { count: 0 };
    out.messages = msgs.count;
    out.emptyThreads = threads.count;
  } catch (e) { out.messages = `skipped (${e instanceof Error ? e.message.split("\n")[0] : "err"})`; }

  // 2) Test expense EXP0034.
  try {
    const exp = await db.expense.deleteMany({ where: { voucherNo: "EXP0034" } });
    out.expense = exp.count;
  } catch (e) { out.expense = `skipped (${e instanceof Error ? e.message.split("\n")[0] : "err"})`; }

  // 3) Test receipt RCPGRE00002 — reverse its allocations, then delete.
  try {
    const payment = await db.payment.findFirst({
      where: { receiptNo: "RCPGRE00002" },
      select: {
        id: true, amount: true,
        allocations: { select: { id: true, amount: true, invoice: { select: { id: true, total: true, amountPaid: true, dueDate: true } } } },
      },
    });
    if (!payment) {
      out.payment = "not found";
    } else {
      await db.$transaction(async (tx) => {
        for (const alloc of payment.allocations) {
          const inv = alloc.invoice;
          const newPaid = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(inv.amountPaid).minus(new Prisma.Decimal(alloc.amount)));
          const total = new Prisma.Decimal(inv.total);
          await tx.invoice.update({
            where: { id: inv.id },
            data: { amountPaid: newPaid, amountDue: total.minus(newPaid), status: invoiceStatusFor(total, newPaid, inv.dueDate) },
          });
        }
        await tx.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });
        await tx.payment.delete({ where: { id: payment.id } });
      });
      out.payment = `deleted RCPGRE00002 (reversed ${payment.allocations.length} allocation(s))`;
    }
  } catch (e) { out.payment = `skipped (${e instanceof Error ? e.message.split("\n")[0] : "err"})`; }

  return cors(NextResponse.json({ ok: true, deleted: out }));
}
