import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { computeFine, DEFAULT_LOAN_POLICY } from "@/lib/library";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  issueId: z.string().min(1),
  condition: z.enum(["AVAILABLE", "LOST", "DAMAGED"]).optional(),
});

/** POST /api/mobile/v1/admin/library/return — return a loaned copy, computing any fine. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "library.circulate");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const condition = parsed.data.condition ?? "AVAILABLE";

  const db = scopedDb(session.schoolId);
  const issue = await db.bookIssue.findUnique({
    where: { id: parsed.data.issueId },
    select: { id: true, copyId: true, dueOn: true, returnedOn: true, copy: { select: { book: { select: { title: true } } } } },
  });
  if (!issue) return cors(NextResponse.json({ error: "Loan not found in your school." }, { status: 404 }));
  if (issue.returnedOn) return cors(NextResponse.json({ error: "This copy has already been returned." }, { status: 409 }));

  const returnedOn = new Date();
  const fine = computeFine({ dueOn: issue.dueOn, returnedOn }, DEFAULT_LOAN_POLICY);

  await db.$transaction([
    db.bookIssue.update({
      where: { id: issue.id },
      data: {
        returnedOn,
        fineAmount: fine.amount,
        finePaid: fine.amount === 0,
        remarks: condition === "AVAILABLE" ? null : `Returned ${condition.toLowerCase()}`,
      },
    }),
    db.bookCopy.update({ where: { id: issue.copyId }, data: { status: condition } }),
  ]);

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "library.return", entityType: "BookCopy", entityId: issue.copyId,
    after: { condition, fine: fine.amount, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: fine.amount > 0
      ? `“${issue.copy.book.title}” returned — ${fine.daysOverdue} days overdue, fine ₹${fine.amount}${fine.isCapped ? " (capped)" : ""}.`
      : `“${issue.copy.book.title}” returned.`,
  }));
}
