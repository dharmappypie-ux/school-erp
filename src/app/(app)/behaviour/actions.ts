"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export interface BehaviourState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const KINDS = ["APPRECIATION", "CONCERN", "NEUTRAL"] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;

const BehaviourSchema = z.object({
  studentId: z.string().trim().min(1, "Choose a student"),
  kind: z.enum(KINDS, { message: "Choose the kind of note" }),
  severity: z.enum(SEVERITIES).optional(),
  category: z.string().trim().max(60).optional(),
  summary: z.string().trim().min(1, "Write a one-line summary").max(200),
  detail: z.string().trim().max(2000).optional(),
  occurredOn: z.string().trim().min(1, "When did this happen?"),
});

/**
 * Records a behaviour note.
 *
 * Severity is only meaningful for a concern — praise has no severity, and
 * storing LOW against an appreciation would make the school-wide "high
 * severity" count meaningless. So it is forced to LOW for anything that is
 * not a concern rather than trusting whatever the form submitted.
 */
export async function createBehaviourLog(
  _previous: BehaviourState,
  formData: FormData,
): Promise<BehaviourState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)]),
  );

  const parsed = BehaviourSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors,
      values: raw,
    };
  }

  const session = await requirePermission("behaviour.manage");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;

  // UTC midnight, matching how every other date-only column in this codebase is
  // built (see attendance). Local midnight would land on the previous day once
  // Postgres casts it to `date` for anyone east of UTC.
  const occurredOn = new Date(`${input.occurredOn}T00:00:00.000Z`);
  if (Number.isNaN(occurredOn.getTime())) {
    return {
      ok: false,
      message: "That date could not be read.",
      fieldErrors: { occurredOn: "Enter a valid date" },
      values: raw,
    };
  }

  // "Future" is judged with a day's grace rather than against UTC midnight.
  // A school in IST picking today's date between 00:00 and 05:30 local is still
  // on yesterday in UTC, so a strict UTC comparison rejects a perfectly ordinary
  // note. One day of slack covers every timezone offset (max +14) while still
  // catching the mistyped year this guard exists for.
  const now = new Date();
  const latestAllowed = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  if (occurredOn > latestAllowed) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: { occurredOn: "A note cannot be dated in the future" },
      values: raw,
    };
  }

  const student = await db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true },
  });
  if (!student) {
    return {
      ok: false,
      message: "That student is no longer on the roll.",
      fieldErrors: { studentId: "Choose a student" },
      values: raw,
    };
  }

  // The note belongs to the staff member who observed it. When the signed-in
  // user is not a staff member (an office account), it is left unattributed
  // rather than credited to the wrong person.
  const staff = await db.staffMember.findFirst({
    where: { userId: session.userId, deletedAt: null },
    select: { id: true },
  });

  const log = await db.behaviourLog.create({
    data: {
      schoolId: session.schoolId,
      studentId: student.id,
      kind: input.kind,
      severity: input.kind === "CONCERN" ? (input.severity ?? "LOW") : "LOW",
      category: input.category || null,
      summary: input.summary,
      detail: input.detail || null,
      occurredOn,
      recordedById: staff?.id ?? null,
      enteredById: session.userId,
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "behaviour.create",
    entityType: "BehaviourLog",
    entityId: log.id,
    after: { studentId: student.id, kind: input.kind, summary: input.summary },
  });

  revalidatePath("/behaviour");
  revalidatePath(`/students/${student.id}`);

  return { ok: true, message: "Note recorded." };
}

/**
 * Retracts a note.
 *
 * The row is kept and flagged rather than deleted: a note a parent has already
 * been shown cannot be made never to have existed, and an audit of the ledger
 * needs to see that someone withdrew it.
 */
export async function retractBehaviourLog(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const session = await requirePermission("behaviour.manage");
  const db = scopedDb(session.schoolId);

  const existing = await db.behaviourLog.findFirst({
    where: { id, retractedAt: null },
    select: { id: true, studentId: true, summary: true },
  });
  if (!existing) return;

  await db.behaviourLog.update({
    where: { id: existing.id },
    data: { retractedAt: new Date(), retractedBy: session.userId },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "behaviour.retract",
    entityType: "BehaviourLog",
    entityId: existing.id,
    before: { summary: existing.summary },
  });

  revalidatePath("/behaviour");
  revalidatePath(`/students/${existing.studentId}`);
}

/** Marks the guardian as informed, so the follow-up queue empties. */
export async function markGuardianNotified(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const session = await requirePermission("behaviour.manage");
  const db = scopedDb(session.schoolId);

  const existing = await db.behaviourLog.findFirst({
    where: { id, retractedAt: null, guardianNotifiedAt: null },
    select: { id: true, studentId: true },
  });
  if (!existing) return;

  await db.behaviourLog.update({
    where: { id: existing.id },
    data: { guardianNotifiedAt: new Date() },
  });

  revalidatePath("/behaviour");
  revalidatePath(`/students/${existing.studentId}`);
}
