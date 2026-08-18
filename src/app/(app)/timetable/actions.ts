"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notifications";
import { scopedDb } from "@/lib/tenant";
import {
  findConflicts,
  generateTimetable,
  WEEK,
  type PlacedSlot,
  type Requirement,
  type Weekday,
} from "@/lib/timetable";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const GenerateSchema = z.object({
  /** Empty means the whole school for the current year. */
  classLevelId: z.string().optional(),
  workingDays: z.coerce.number().int().min(1).max(7).default(6),
  seed: z.coerce.number().int().optional(),
});

/**
 * Rebuilds the timetable from the subject-teacher assignments on record.
 *
 * Replaces the existing slots for the affected sections in one transaction, so
 * a failure part-way cannot leave the school with half a timetable. Refuses to
 * write anything if the generated grid somehow still contains a clash.
 */
export async function generateTimetableFor(
  input: z.infer<typeof GenerateSchema>,
): Promise<ActionResult> {
  const parsed = GenerateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("timetable.manage");
  const db = scopedDb(session.schoolId);
  const { classLevelId, workingDays, seed } = parsed.data;

  if (!session.academicYear) {
    return { ok: false, message: "No academic year is marked current." };
  }
  const academicYearId = session.academicYear.id;

  const [sections, periods] = await Promise.all([
    db.section.findMany({
      where: { academicYearId, ...(classLevelId ? { classLevelId } : {}) },
      select: { id: true, name: true, classLevelId: true },
    }),
    db.period.findMany({
      orderBy: { sequence: "asc" },
      select: { id: true, sequence: true, isBreak: true },
    }),
  ]);

  if (sections.length === 0) {
    return { ok: false, message: "No sections found for this year." };
  }
  if (periods.filter((period) => !period.isBreak).length === 0) {
    return { ok: false, message: "No teaching periods are configured." };
  }

  // Subject demand is defined per class level; every section of that level
  // inherits it, which is what creates teacher contention between sections.
  // tenant-safe: classLevelIds are derived from sections already fetched through scopedDb.
  const classSubjects = await db.classSubject.findMany({
    where: { classLevelId: { in: [...new Set(sections.map((s) => s.classLevelId))] } },
    select: {
      classLevelId: true,
      sectionId: true,
      subjectId: true,
      teacherId: true,
      weeklyPeriods: true,
    },
  });

  if (classSubjects.length === 0) {
    return {
      ok: false,
      message: "No subjects are mapped to these classes yet, so there is nothing to schedule.",
    };
  }

  const requirements: Requirement[] = [];
  for (const section of sections) {
    for (const entry of classSubjects) {
      if (entry.classLevelId !== section.classLevelId) continue;
      // A row pinned to another section does not apply to this one.
      if (entry.sectionId && entry.sectionId !== section.id) continue;
      requirements.push({
        sectionId: section.id,
        subjectId: entry.subjectId,
        teacherId: entry.teacherId,
        periodsPerWeek: entry.weeklyPeriods,
      });
    }
  }

  const days: Weekday[] = WEEK.slice(0, workingDays);
  const report = generateTimetable(requirements, periods, {
    days,
    seed: seed ?? 20260401,
    attempts: 8,
  });

  // Belt and braces: never persist a grid that clashes.
  if (report.conflicts.length > 0) {
    return {
      ok: false,
      message: `Generation produced ${report.conflicts.length} conflicts and was discarded. Nothing was changed.`,
    };
  }

  const sectionIds = sections.map((section) => section.id);

  await db.$transaction(async (tx) => {
    await tx.timetableSlot.deleteMany({
      where: { academicYearId, sectionId: { in: sectionIds } },
    });
    await tx.timetableSlot.createMany({
      data: report.slots.map((slot: PlacedSlot) => ({
        schoolId: session.schoolId,
        academicYearId,
        sectionId: slot.sectionId,
        periodId: slot.periodId,
        subjectId: slot.subjectId,
        teacherId: slot.teacherId,
        dayOfWeek: slot.dayOfWeek,
      })),
    });
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "timetable.generate",
    entityType: "AcademicYear",
    entityId: academicYearId,
    after: {
      sections: sections.length,
      placed: report.placed,
      requested: report.requested,
      shortfalls: report.shortfalls.length,
      attempts: report.attemptsUsed,
    },
  });

  revalidatePath("/timetable");

  const shortfallTotal = report.shortfalls.reduce(
    (sum, entry) => sum + entry.missing,
    0,
  );

  return {
    ok: true,
    message:
      shortfallTotal === 0
        ? `Scheduled all ${report.placed} periods across ${sections.length} sections with no clashes.`
        : `Scheduled ${report.placed} of ${report.requested} periods across ${sections.length} sections with no clashes. ${shortfallTotal} could not be placed — there are not enough free slots for the demand.`,
  };
}

const SubstituteSchema = z.object({
  slotId: z.string().min(1),
  substituteId: z.string().min(1, "Choose a teacher"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date"),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Arranges cover for one lesson on one date.
 *
 * Refuses a teacher who is already timetabled in that period, so cover cannot
 * create the very clash the generator avoids.
 */
export async function assignSubstitute(
  input: z.infer<typeof SubstituteSchema>,
): Promise<ActionResult> {
  const parsed = SubstituteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("timetable.manage");
  const db = scopedDb(session.schoolId);
  const { slotId, substituteId, date, reason } = parsed.data;

  const slot = await db.timetableSlot.findUnique({
    where: { id: slotId },
    select: {
      id: true,
      dayOfWeek: true,
      periodId: true,
      teacherId: true,
      subject: { select: { name: true } },
      section: { select: { name: true, classLevel: { select: { name: true } } } },
    },
  });
  if (!slot) return { ok: false, message: "Lesson not found in your school." };

  if (slot.teacherId === substituteId) {
    return { ok: false, message: "That teacher already takes this lesson." };
  }

  // Is the proposed substitute already teaching in this period?
  const clash = await db.timetableSlot.findFirst({
    where: {
      teacherId: substituteId,
      dayOfWeek: slot.dayOfWeek,
      periodId: slot.periodId,
      id: { not: slotId },
    },
    select: {
      subject: { select: { name: true } },
      section: { select: { name: true, classLevel: { select: { name: true } } } },
    },
  });
  if (clash) {
    return {
      ok: false,
      message: `That teacher is already taking ${clash.subject?.name ?? "a lesson"} with ${clash.section.classLevel.name} ${clash.section.name} in this period.`,
    };
  }

  const substitute = await db.staffMember.findUnique({
    where: { id: substituteId },
    select: { id: true, firstName: true, lastName: true, user: { select: { id: true, email: true } } },
  });
  if (!substitute) return { ok: false, message: "Teacher not found in your school." };

  const day = new Date(`${date}T00:00:00.000Z`);

  // tenant-safe: slotId comes from the scoped timetableSlot lookup above.
  await db.timetableSubstitution.upsert({
    where: { slotId_date: { slotId, date: day } },
    create: { slotId, date: day, substituteId, reason: reason || null },
    update: { substituteId, reason: reason || null },
  });

  await queueNotification({
    schoolId: session.schoolId,
    channel: "IN_APP",
    recipient: substitute.user?.email ?? substitute.id,
    userId: substitute.user?.id,
    subject: "Substitution assigned",
    body: `You are covering ${slot.subject?.name ?? "a lesson"} for ${slot.section.classLevel.name} ${slot.section.name} on ${date}.`,
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "timetable.substitute",
    entityType: "TimetableSlot",
    entityId: slotId,
    after: { substituteId, date, reason },
  });

  revalidatePath("/timetable");

  return {
    ok: true,
    message: `${substitute.firstName} ${substitute.lastName ?? ""} will cover this lesson on ${date}.`,
  };
}

/** Re-checks the stored timetable and reports any clash. */
export async function auditTimetable(): Promise<
  ActionResult & { conflicts: number }
> {
  const session = await requirePermission("timetable.read");
  const db = scopedDb(session.schoolId);

  if (!session.academicYear) {
    return { ok: false, conflicts: 0, message: "No academic year is marked current." };
  }

  const slots = await db.timetableSlot.findMany({
    where: { academicYearId: session.academicYear.id },
    select: {
      sectionId: true,
      dayOfWeek: true,
      periodId: true,
      subjectId: true,
      teacherId: true,
    },
  });

  const conflicts = findConflicts(
    slots.map((slot) => ({
      sectionId: slot.sectionId,
      dayOfWeek: slot.dayOfWeek as Weekday,
      periodId: slot.periodId,
      subjectId: slot.subjectId ?? "",
      teacherId: slot.teacherId,
    })),
  );

  return {
    ok: conflicts.length === 0,
    conflicts: conflicts.length,
    message:
      conflicts.length === 0
        ? `Checked ${slots.length} scheduled periods — no clashes.`
        : `Found ${conflicts.length} clashes across ${slots.length} scheduled periods. Regenerate to fix them.`,
  };
}
