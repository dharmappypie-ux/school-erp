"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { scopedDb, type ScopedDb } from "@/lib/tenant";

export interface SiblingState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const RELATIONS = ["BROTHER", "SISTER", "OTHER"] as const;

const SiblingSchema = z.object({
  studentId: z.string().trim().min(1, "Choose a student"),
  name: z.string().trim().min(1, "Enter the sibling's name").max(120),
  relation: z.enum(RELATIONS, { message: "Choose brother, sister or other" }),
  dateOfBirth: z.string().trim().optional(),
  schoolName: z.string().trim().max(160).optional(),
  siblingStudentId: z.string().trim().optional(),
  notes: z.string().trim().max(500).optional(),
  /// Which half of the form was showing. Without it, "on this roll" with nobody
  /// picked is indistinguishable from "studies elsewhere, name not given", and a
  /// school name already on the record would be nulled with no error shown.
  place: z.enum(["roll", "elsewhere"]).optional(),
});

const EditSchema = SiblingSchema.extend({
  id: z.string().trim().min(1, "Choose a sibling to edit"),
});

function readForm(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)]),
  );
}

function invalid(
  issues: z.ZodIssue[],
  values: Record<string, string>,
): SiblingState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0]);
    // The first complaint about a field is the one that explains it; anything
    // after it is usually a knock-on of the same mistake.
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors,
    values,
  };
}

function rejectField(
  field: string,
  message: string,
  values: Record<string, string>,
): SiblingState {
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: { [field]: message },
    values,
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the date of birth into the UTC midnight that a `@db.Date` column
 * expects. Local midnight drifts to the previous day for anyone east of UTC
 * once Postgres casts it, which this codebase has shipped twice.
 */
function parseDateOfBirth(
  value: string | undefined,
): { ok: true; value: Date | null } | { ok: false; message: string } {
  if (!value) return { ok: true, value: null };
  if (!DATE_ONLY.test(value)) return { ok: false, message: "Enter a valid date" };

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: "Enter a valid date" };
  }

  // A day of grace rather than a strict UTC comparison: a school in IST
  // entering today's date before 05:30 local is still on yesterday in UTC, and
  // would otherwise be told a perfectly ordinary birthday is in the future.
  // One day covers every offset (max +14) and still catches a mistyped year.
  const now = new Date();
  const latestAllowed = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  if (date > latestAllowed) {
    return { ok: false, message: "A date of birth cannot be in the future" };
  }
  return { ok: true, value: date };
}

/**
 * Resolves the optional "this sibling is on our roll" link.
 *
 * The lookup goes through `scopedDb`, so a student id belonging to another
 * school simply fails to match rather than being linked across tenants.
 */
async function resolveLink(
  db: ScopedDb,
  value: string | undefined,
  studentId: string,
): Promise<
  { ok: true; siblingStudentId: string | null } | { ok: false; message: string }
> {
  if (!value) return { ok: true, siblingStudentId: null };
  if (value === studentId) {
    return { ok: false, message: "A child cannot be their own sibling" };
  }

  const match = await db.student.findFirst({
    where: { id: value, deletedAt: null },
    select: { id: true },
  });
  if (!match) {
    return { ok: false, message: "That student is not on this school's roll" };
  }
  return { ok: true, siblingStudentId: match.id };
}

/** Records a sibling against an enrolled student. */
export async function addSibling(
  _previous: SiblingState,
  formData: FormData,
): Promise<SiblingState> {
  const raw = readForm(formData);

  const parsed = SiblingSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues, raw);

  const session = await requirePermission("students.update");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;

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

  const dateOfBirth = parseDateOfBirth(input.dateOfBirth);
  if (!dateOfBirth.ok) {
    return rejectField("dateOfBirth", dateOfBirth.message, raw);
  }

  if (input.place === "roll" && !input.siblingStudentId) {
    return rejectField("siblingStudentId", "Choose the student on this roll", raw);
  }

  const link = await resolveLink(db, input.siblingStudentId, student.id);
  if (!link.ok) return rejectField("siblingStudentId", link.message, raw);

  const sibling = await db.studentSibling.create({
    data: {
      schoolId: session.schoolId,
      studentId: student.id,
      name: input.name,
      relation: input.relation,
      dateOfBirth: dateOfBirth.value,
      // A sibling who is on this roll studies here by definition; keeping a
      // typed school name beside the link would leave two answers on record.
      schoolName: link.siblingStudentId ? null : input.schoolName || null,
      siblingStudentId: link.siblingStudentId,
      notes: input.notes || null,
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "student.sibling.add",
    entityType: "StudentSibling",
    entityId: sibling.id,
    after: {
      studentId: student.id,
      name: input.name,
      relation: input.relation,
      siblingStudentId: link.siblingStudentId,
    },
  });

  revalidatePath(`/students/${student.id}`);
  revalidatePath(`/students/${student.id}/edit`);

  return { ok: true, message: `${input.name} added.` };
}

/** Corrects a sibling already on the student's record. */
export async function updateSibling(
  _previous: SiblingState,
  formData: FormData,
): Promise<SiblingState> {
  const raw = readForm(formData);

  const parsed = EditSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues, raw);

  const session = await requirePermission("students.update");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;

  // Matched on the student as well as the id, so a sibling cannot be moved
  // from one child's record to another by editing the hidden field.
  const existing = await db.studentSibling.findFirst({
    where: { id: input.id, studentId: input.studentId },
    select: {
      id: true,
      studentId: true,
      name: true,
      relation: true,
      schoolName: true,
      siblingStudentId: true,
    },
  });
  if (!existing || !existing.studentId) {
    return {
      ok: false,
      message: "That sibling is no longer on this student's record.",
      values: raw,
    };
  }

  const dateOfBirth = parseDateOfBirth(input.dateOfBirth);
  if (!dateOfBirth.ok) {
    return rejectField("dateOfBirth", dateOfBirth.message, raw);
  }

  // Same guard as addSibling: on an edit this is the destructive case — switching a
  // sibling from "studies at St Xavier's" to "on this roll" and saving before picking
  // anyone would null the school name permanently.
  if (input.place === "roll" && !input.siblingStudentId) {
    return rejectField("siblingStudentId", "Choose the student on this roll", raw);
  }

  const link = await resolveLink(db, input.siblingStudentId, existing.studentId);
  if (!link.ok) return rejectField("siblingStudentId", link.message, raw);

  await db.studentSibling.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      relation: input.relation,
      dateOfBirth: dateOfBirth.value,
      schoolName: link.siblingStudentId ? null : input.schoolName || null,
      siblingStudentId: link.siblingStudentId,
      notes: input.notes || null,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "student.sibling.update",
    entityType: "StudentSibling",
    entityId: existing.id,
    before: {
      name: existing.name,
      relation: existing.relation,
      schoolName: existing.schoolName,
      siblingStudentId: existing.siblingStudentId,
    },
    after: {
      name: input.name,
      relation: input.relation,
      siblingStudentId: link.siblingStudentId,
    },
  });

  revalidatePath(`/students/${existing.studentId}`);
  revalidatePath(`/students/${existing.studentId}/edit`);

  return { ok: true, message: `${input.name} updated.` };
}

/**
 * Removes a sibling outright.
 *
 * This is reference data a parent gave us, not a ledger: a family correcting
 * "she has a brother" wants the line gone, and a tombstoned row would keep
 * showing up in sibling counts and concession checks.
 */
export async function removeSibling(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  const studentId = String(formData.get("studentId") ?? "").trim();
  if (!id || !studentId) return;

  const session = await requirePermission("students.update");
  const db = scopedDb(session.schoolId);

  const existing = await db.studentSibling.findFirst({
    where: { id, studentId },
    select: { id: true, studentId: true, name: true, relation: true },
  });
  if (!existing) return;

  await db.studentSibling.delete({ where: { id: existing.id } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "student.sibling.remove",
    entityType: "StudentSibling",
    entityId: existing.id,
    before: {
      studentId: existing.studentId,
      name: existing.name,
      relation: existing.relation,
    },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/students/${studentId}/edit`);
}
