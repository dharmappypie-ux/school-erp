import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { DEFAULT_LOAN_POLICY, canRenew } from "@/lib/library";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ issueId: z.string().min(1) });

/**
 * POST /api/mobile/v1/admin/library/renew
 *
 * Renews a loan: if within the renewal limit and not overdue (per
 * DEFAULT_LOAN_POLICY and the shared `canRenew`), extends the due date by the
 * loan period and bumps the renewal count.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "library.circulate");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const issue = await db.bookIssue.findUnique({
    where: { id: parsed.data.issueId },
    select: { id: true, dueOn: true, returnedOn: true, renewCount: true, copy: { select: { book: { select: { title: true } } } } },
  });
  if (!issue) return cors(NextResponse.json({ error: "Loan not found in your school." }, { status: 404 }));

  const check = canRenew(
    { renewCount: issue.renewCount, dueOn: issue.dueOn, returnedOn: issue.returnedOn },
    { policy: DEFAULT_LOAN_POLICY },
  );
  if (!check.allowed) {
    return cors(NextResponse.json({ error: check.reason ?? "This loan cannot be renewed." }, { status: 409 }));
  }

  const newDue = new Date(issue.dueOn.getTime() + DEFAULT_LOAN_POLICY.loanDays * 86_400_000);
  await db.bookIssue.update({
    where: { id: issue.id },
    data: { dueOn: newDue, renewCount: { increment: 1 } },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "library.renew", entityType: "BookIssue", entityId: issue.id,
    after: { newDue: newDue.toISOString(), renewCount: issue.renewCount + 1, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `“${issue.copy.book.title}” renewed — now due ${newDue.toISOString().slice(0, 10)}.`,
  }));
}
