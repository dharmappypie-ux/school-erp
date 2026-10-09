"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";
import { validateLeave, type LeavePortion } from "@/lib/student-leave";

export interface ApplyState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const PORTIONS = ["FULL_DAY", "FIRST_HALF", "SECOND_HALF"] as const;

/**
 * Raises a leave request for a student.
 *
 * The child is resolved through `resolvePortalStudent`, never from a studentId
 * in the form: a guardian with two children at the school must not be able to
 * book leave for somebody else's by editing a hidden field.
 */
export async function applyStudentLeave(
  _previous: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const session = await requirePermission("studentleave.apply");

  const raw = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)]),
  );

  const childParam = raw.child || undefined;
  const { child } = await resolvePortalStudent(childParam);

  const portion = (PORTIONS as readonly string[]).includes(raw.portion)
    ? (raw.portion as LeavePortion)
    : "FULL_DAY";

  const check = validateLeave(
    {
      fromDate: raw.fromDate ?? "",
      toDate: raw.toDate ?? "",
      portion,
      reason: raw.reason ?? "",
      leavingAfterPeriod: raw.leavingAfterPeriod,
    },
    new Date(),
  );

  if (!check.ok || !check.parsed) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: check.fieldErrors,
      values: raw,
    };
  }

  const db = scopedDb(session.schoolId);
  const { from, to, days, leavingAfterPeriod } = check.parsed;

  // Two requests covering the same day is the common double-submit, and leaves
  // staff deciding the same absence twice.
  const overlapping = await db.studentLeaveRequest.findFirst({
    where: {
      studentId: child.id,
      status: { in: ["PENDING", "APPROVED"] },
      fromDate: { lte: to },
      toDate: { gte: from },
    },
    select: { id: true, status: true },
  });

  if (overlapping) {
    return {
      ok: false,
      message:
        overlapping.status === "PENDING"
          ? "A request already covers those dates and is awaiting a decision."
          : "Approved leave already covers those dates.",
      values: raw,
    };
  }

  const created = await db.studentLeaveRequest.create({
    data: {
      schoolId: session.schoolId,
      studentId: child.id,
      fromDate: from,
      toDate: to,
      portion,
      leavingAfterPeriod,
      reason: raw.reason.trim(),
      requestedById: session.userId,
      status: "PENDING",
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "studentleave.apply",
    entityType: "StudentLeaveRequest",
    entityId: created.id,
    after: { studentId: child.id, days, portion },
  });

  revalidatePath("/portal/leave");
  revalidatePath("/leave/students");

  return {
    ok: true,
    message: `Request sent for ${days} ${days === 1 ? "day" : "days"}. The class teacher will respond.`,
  };
}

/** Withdraws a request that has not been decided yet. */
export async function cancelStudentLeave(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const session = await requirePermission("studentleave.apply");
  const db = scopedDb(session.schoolId);
  const { child } = await resolvePortalStudent(
    String(formData.get("child") ?? "") || undefined,
  );

  // Scoped to this child, so a crafted id cannot withdraw another family's request.
  const request = await db.studentLeaveRequest.findFirst({
    where: { id, studentId: child.id, status: "PENDING" },
    select: { id: true },
  });
  if (!request) return;

  await db.studentLeaveRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });

  revalidatePath("/portal/leave");
  revalidatePath("/leave/students");
}
