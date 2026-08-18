"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { queueNotification } from "@/lib/notifications";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const DecideSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(300).optional(),
});

/**
 * Approves or rejects a leave request.
 *
 * Approval debits the staff member's balance in the same transaction as the
 * status change, so a balance can never drift from the approvals that caused
 * it. Rejecting an already-approved request credits the days back.
 */
export async function decideLeave(
  input: z.infer<typeof DecideSchema>,
): Promise<ActionResult> {
  const parsed = DecideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("leave.approve");
  const db = scopedDb(session.schoolId);
  const { requestId, decision, note } = parsed.data;

  const request = await db.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      leaveType: { select: { id: true, name: true, isPaid: true } },
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          user: { select: { id: true, email: true } },
        },
      },
    },
  });
  if (!request) return { ok: false, message: "Request not found in your school." };

  if (request.status === decision) {
    return { ok: false, message: `This request is already ${decision.toLowerCase()}.` };
  }
  if (request.status === "CANCELLED") {
    return { ok: false, message: "A cancelled request cannot be decided." };
  }

  const days = toNumber(request.days);
  const year = request.fromDate.getUTCFullYear();
  const wasApproved = request.status === "APPROVED";

  await db.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: decision,
        approverId: session.userId,
        decidedAt: new Date(),
        decisionNote: note || null,
      },
    });

    // Paid leave consumes balance; loss-of-pay types do not have one to spend.
    if (!request.leaveType.isPaid) return;

    if (decision === "APPROVED" && !wasApproved) {
      await tx.leaveBalance.upsert({
        where: {
          staffId_leaveTypeId_year: {
            staffId: request.staffId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
        create: {
          staffId: request.staffId,
          leaveTypeId: request.leaveTypeId,
          year,
          allocated: 0,
          used: days,
        },
        update: { used: { increment: days } },
      });
    } else if (decision === "REJECTED" && wasApproved) {
      // Reversing an approval must return the days, or the balance stays
      // permanently short.
      await tx.leaveBalance.updateMany({
        where: {
          staffId: request.staffId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
        data: { used: { decrement: days } },
      });
    }
  });

  await queueNotification({
    schoolId: session.schoolId,
    channel: "IN_APP",
    recipient: request.staff.user?.email ?? request.staff.id,
    userId: request.staff.user?.id,
    subject: `Leave ${decision.toLowerCase()}`,
    body: `Your ${request.leaveType.name} request for ${days} day(s) has been ${decision.toLowerCase()}.${note ? ` Note: ${note}` : ""}`,
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "leave.decide",
    entityType: "LeaveRequest",
    entityId: requestId,
    before: { status: request.status },
    after: { status: decision, days, note },
  });

  revalidatePath("/leave");
  revalidatePath(`/staff/${request.staffId}`);

  return {
    ok: true,
    message: `${request.leaveType.name} for ${request.staff.firstName} ${request.staff.lastName ?? ""} ${decision.toLowerCase()}.`,
  };
}
