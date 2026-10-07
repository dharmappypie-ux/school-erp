import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  requestId: z.string().min(1, "Missing the request"),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/mobile/v1/admin/leave/decide
 *
 * Approve or reject a leave request, mirroring the web `decideLeave` action:
 * records the decision and keeps the staff member's paid-leave balance in step
 * (consume on approve, return on a reversal).
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "leave.approve");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { requestId, decision, note } = parsed.data;

  const db = scopedDb(session.schoolId);
  const request = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      leaveType: { select: { id: true, name: true, isPaid: true } },
      staff: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!request) return cors(NextResponse.json({ error: "Request not found in your school." }, { status: 404 }));
  if (request.status === decision) {
    return cors(NextResponse.json({ error: `This request is already ${decision.toLowerCase()}.` }, { status: 409 }));
  }
  if (request.status === "CANCELLED") {
    return cors(NextResponse.json({ error: "A cancelled request cannot be decided." }, { status: 409 }));
  }

  const days = toNumber(request.days);
  const year = request.fromDate.getUTCFullYear();
  const wasApproved = request.status === "APPROVED";

  await db.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: requestId },
      data: { status: decision, approverId: session.userId, decidedAt: new Date(), decisionNote: note || null },
    });
    if (!request.leaveType.isPaid) return;
    if (decision === "APPROVED" && !wasApproved) {
      await tx.leaveBalance.upsert({
        where: { staffId_leaveTypeId_year: { staffId: request.staffId, leaveTypeId: request.leaveTypeId, year } },
        create: { staffId: request.staffId, leaveTypeId: request.leaveTypeId, year, allocated: 0, used: days },
        update: { used: { increment: days } },
      });
    } else if (decision === "REJECTED" && wasApproved) {
      await tx.leaveBalance.updateMany({
        where: { staffId: request.staffId, leaveTypeId: request.leaveTypeId, year },
        data: { used: { decrement: days } },
      });
    }
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "leave.decide", entityType: "LeaveRequest", entityId: requestId,
    before: { status: request.status }, after: { status: decision, days, via: "mobile" },
  });

  const name = `${request.staff.firstName} ${request.staff.lastName ?? ""}`.trim();
  return cors(NextResponse.json({
    ok: true,
    message: `${request.leaveType.name} for ${name} ${decision.toLowerCase()}.`,
  }));
}
