import { NextResponse } from "next/server";

import { Prisma } from "@/lib/db";
import { invoiceStatusFor } from "@/lib/fees";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

// The three fee structures the QA run billed from (incl. two duplicates).
const QA_STRUCTURES = ["cmsvkd1iz01s0ph8o6yqs0zku", "cmsvlyhsv000db18ovs44jl7b", "cmsvlyhtm002vb18o5c1gf7a3"];

/**
 * POST /api/mobile/v1/admin/cleanup-zztest — TEMPORARY. Removes the QA sweep's
 * ZZTEST test rows + the invoices it generated today (unpaid only), in the
 * caller's school. Super-admin only. Remove after running.
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
  const Z = { contains: "ZZTEST" };
  const run = async (name: string, fn: () => Promise<{ count: number }>) => {
    try { out[name] = (await fn()).count; }
    catch (e) { out[name] = `skipped (${e instanceof Error ? e.message.split("\n")[0] : "err"})`; }
  };

  await run("messages", async () => {
    const m = await db.message.deleteMany({ where: { body: Z } });
    const empty = await db.messageThread.findMany({ where: { messages: { none: {} } }, select: { id: true } });
    if (empty.length) await db.messageThread.deleteMany({ where: { id: { in: empty.map((t) => t.id) } } });
    return m;
  });
  await run("homework", () => db.homework.deleteMany({ where: { title: Z } }));
  await run("books", () => db.book.deleteMany({ where: { title: Z } }));
  await run("notices", () => db.notice.deleteMany({ where: { title: Z } }));
  await run("quizzes", () => db.quiz.deleteMany({ where: { title: Z } }));
  await run("courses", () => db.course.deleteMany({ where: { title: Z } }));
  await run("subjects", () => db.subject.deleteMany({ where: { name: Z } }));
  await run("inventory", () => db.inventoryItem.deleteMany({ where: { name: Z } }));
  await run("academicYears", () => db.academicYear.deleteMany({ where: { name: Z, isCurrent: false } }));
  await run("transportStops", () => db.routeStop.deleteMany({ where: { name: Z } }));
  await run("expenseEXP0034", () => db.expense.deleteMany({ where: { voucherNo: "EXP0034" } }));
  await run("staff", () => db.staffMember.deleteMany({ where: { firstName: Z } }));

  // ZZTEST students: collect their + their guardians' login emails, delete the
  // students, then delete those orphaned logins.
  await run("students", async () => {
    const studs = await db.student.findMany({
      where: { firstName: Z },
      select: { id: true, email: true, guardians: { select: { guardian: { select: { id: true, user: { select: { email: true } } } } } } },
    });
    if (!studs.length) return { count: 0 };
    const emails = new Set<string>();
    const guardianIds = new Set<string>();
    for (const s of studs) {
      if (s.email) emails.add(s.email);
      for (const g of s.guardians) {
        guardianIds.add(g.guardian.id);
        if (g.guardian.user?.email) emails.add(g.guardian.user.email);
      }
    }
    const res = await db.student.deleteMany({ where: { id: { in: studs.map((s) => s.id) } } });
    if (guardianIds.size) await db.guardian.deleteMany({ where: { id: { in: [...guardianIds] }, students: { none: {} } } }).catch(() => undefined);
    if (emails.size) await db.user.deleteMany({ where: { email: { in: [...emails] } } }).catch(() => undefined);
    return res;
  });

  await run("users", () => db.user.deleteMany({ where: { OR: [{ email: { startsWith: "zztest" } }, { email: { startsWith: "aazztest" } }] } }));

  // Payment RCPGRE00002 — reverse its allocation then delete.
  await run("paymentRCPGRE00002", async () => {
    const p = await db.payment.findFirst({
      where: { receiptNo: "RCPGRE00002" },
      select: { id: true, allocations: { select: { amount: true, invoice: { select: { id: true, total: true, amountPaid: true, dueDate: true } } } } },
    });
    if (!p) return { count: 0 };
    await db.$transaction(async (tx) => {
      for (const a of p.allocations) {
        const inv = a.invoice;
        const newPaid = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(inv.amountPaid).minus(new Prisma.Decimal(a.amount)));
        const total = new Prisma.Decimal(inv.total);
        await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: newPaid, amountDue: total.minus(newPaid), status: invoiceStatusFor(total, newPaid, inv.dueDate) } });
      }
      await tx.paymentAllocation.deleteMany({ where: { paymentId: p.id } });
      await tx.payment.delete({ where: { id: p.id } });
    });
    return { count: 1 };
  });

  // Invoices the sweep generated today from the QA structures — unpaid only.
  await run("generatedInvoices", async () => {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const where = { structureId: { in: QA_STRUCTURES }, amountPaid: new Prisma.Decimal(0), createdAt: { gte: dayStart } };
    const ids = (await db.invoice.findMany({ where, select: { id: true } })).map((i) => i.id);
    if (!ids.length) return { count: 0 };
    await db.invoiceLine.deleteMany({ where: { invoiceId: { in: ids } } });
    return db.invoice.deleteMany({ where: { id: { in: ids } } });
  });

  return cors(NextResponse.json({ ok: true, deleted: out }));
}
