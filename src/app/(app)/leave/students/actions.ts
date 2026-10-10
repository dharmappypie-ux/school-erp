"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export interface DecisionState {
  ok: boolean;
  message: string;
}

/**
 * Approves or rejects a student's leave request.
 *
 * Only a PENDING request can be decided. Re-deciding one that has already been
 * answered would quietly overwrite the first decision and the note explaining
 * it, which is exactly what a parent would later dispute.
 */
export async function decideStudentLeave(
  _previous: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const id = String(formData.get("id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!id || (decision !== "APPROVED" && decision !== "REJECTED")) {
    return { ok: false, message: "That decision could not be read." };
  }

  const session = await requirePermission("studentleave.approve");
  const db = scopedDb(session.schoolId);

  const request = await db.studentLeaveRequest.findFirst({
    where: { id },
    select: {
      id: true,
      status: true,
      studentId: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  if (!request) return { ok: false, message: "That request no longer exists." };
  if (request.status !== "PENDING") {
    return {
      ok: false,
      message: `That request was already ${request.status.toLowerCase()}.`,
    };
  }

  // Rejecting without saying why leaves the family with nothing to act on.
  if (decision === "REJECTED" && note === "") {
    return { ok: false, message: "Give a reason when rejecting a request." };
  }

  await db.studentLeaveRequest.update({
    where: { id: request.id },
    data: {
      status: decision,
      decidedById: session.userId,
      decidedAt: new Date(),
      decisionNote: note || null,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "studentleave.decide",
    entityType: "StudentLeaveRequest",
    entityId: request.id,
    before: { status: request.status },
    after: { status: decision, note },
  });

  revalidatePath("/leave/students");
  revalidatePath("/portal/leave");
  revalidatePath(`/students/${request.studentId}`);

  const name = `${request.student.firstName} ${request.student.lastName ?? ""}`.trim();
  return {
    ok: true,
    message:
      decision === "APPROVED"
        ? `Leave approved for ${name}.`
        : `Leave rejected for ${name}.`,
  };
}
