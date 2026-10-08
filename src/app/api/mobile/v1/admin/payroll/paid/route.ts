import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ payslipId: z.string().min(1) });

/** POST /api/mobile/v1/admin/payroll/paid — mark a payslip paid. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "payroll.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const slip = await db.payslip.findUnique({
    where: { id: parsed.data.payslipId },
    select: { id: true, status: true, staff: { select: { firstName: true } } },
  });
  if (!slip) return cors(NextResponse.json({ error: "Payslip not found in your school." }, { status: 404 }));
  if (slip.status === "PAID") return cors(NextResponse.json({ error: "This payslip is already paid." }, { status: 409 }));

  await db.payslip.update({ where: { id: slip.id }, data: { status: "PAID", paidOn: new Date() } });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "payroll.paid", entityType: "Payslip", entityId: slip.id, after: { via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `${slip.staff.firstName}'s payslip marked paid.` }));
}
