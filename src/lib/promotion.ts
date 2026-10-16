import "server-only";

import { recordAudit } from "@/lib/audit";
import { scopedDb } from "@/lib/tenant";

/**
 * End-of-year promotion.
 *
 * The year rollover is the largest single operation a school performs, and the
 * one most dangerous to get half-right: a partially promoted class leaves
 * students with no active enrollment, invisible to attendance and fees. So the
 * whole run is one transaction — every student moves or none does.
 *
 * Both surfaces call this: the web console's promotion form and the mobile
 * app's promotion screen. Neither owns the rules.
 */

/**
 * What happens to one student at the end of the year.
 *
 * RETAINED repeats the year in the same class, so it still creates an
 * enrollment in the new year — pointing at that year's copy of the class the
 * student was already in. PASSED_OUT and TRANSFERRED create nothing: the
 * student leaves the roll.
 */
export const OUTCOMES = ["PROMOTED", "RETAINED", "PASSED_OUT", "TRANSFERRED"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);
}

export interface PromotionState {
  ok: boolean;
  message: string;
  /** Per-student lines explaining anything that was not moved. */
  skipped?: string[];
  moved?: number;
}

export interface PromotionInput {
  sourceSectionId: string;
  targetSectionId: string;
  allowOverfill: boolean;
  /** studentId → outcome. Anyone not listed is PROMOTED. */
  outcomes: Map<string, Outcome>;
}

/** The classes a promotion run can move between, with their occupancy. */
export async function promotableSections(schoolId: string) {
  const db = scopedDb(schoolId);
  const sections = await db.section.findMany({
    orderBy: [
      { academicYear: { startDate: "desc" } },
      { classLevel: { numericOrder: "asc" } },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      capacity: true,
      classLevel: { select: { name: true, numericOrder: true } },
      academicYear: { select: { id: true, name: true, isCurrent: true, isLocked: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });
  return sections.map((s) => ({
    id: s.id,
    label: `${s.classLevel.name} · ${s.name}`,
    classLevel: s.classLevel.name,
    order: s.classLevel.numericOrder,
    capacity: s.capacity,
    filled: s._count.enrollments,
    yearId: s.academicYear.id,
    yearName: s.academicYear.name,
    yearIsCurrent: s.academicYear.isCurrent,
    yearIsLocked: s.academicYear.isLocked,
  }));
}

/** The active roll of one section — the students a run would act on. */
export async function promotionRoster(schoolId: string, sectionId: string) {
  const db = scopedDb(schoolId);
  const enrollments = await db.enrollment.findMany({
    where: { sectionId, isActive: true },
    orderBy: [{ rollNumber: "asc" }],
    select: {
      rollNumber: true,
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
    },
  });
  return enrollments.map((e) => ({
    studentId: e.student.id,
    name: `${e.student.firstName} ${e.student.lastName ?? ""}`.trim(),
    admissionNo: e.student.admissionNo,
    rollNumber: e.rollNumber,
  }));
}

/**
 * Promotes a whole class at once. The caller must already have authorised
 * `students.update`.
 */
export async function promoteSection(
  actor: { schoolId: string; userId: string },
  input: PromotionInput,
): Promise<PromotionState> {
  const db = scopedDb(actor.schoolId);
  const { sourceSectionId, targetSectionId, allowOverfill, outcomes } = input;

  if (sourceSectionId === targetSectionId) {
    return { ok: false, message: "The target class is the same as the source class." };
  }

  const [source, target] = await Promise.all([
    db.section.findUnique({
      where: { id: sourceSectionId },
      select: {
        id: true,
        name: true,
        academicYearId: true,
        classLevelId: true,
        classLevel: { select: { name: true } },
      },
    }),
    db.section.findUnique({
      where: { id: targetSectionId },
      select: {
        id: true,
        name: true,
        academicYearId: true,
        capacity: true,
        classLevel: { select: { name: true } },
        _count: { select: { enrollments: { where: { isActive: true } } } },
      },
    }),
  ]);

  if (!source || !target) {
    return { ok: false, message: "One of those classes is not in your school." };
  }

  // Promoting within one year would collide with the one-enrollment-per-year
  // rule, and is a lateral move rather than a promotion.
  if (source.academicYearId === target.academicYearId) {
    return {
      ok: false,
      message:
        "Both classes are in the same academic year. Promotion moves students into a different year.",
    };
  }

  const targetYear = await db.academicYear.findUnique({
    where: { id: target.academicYearId },
    select: { name: true, isLocked: true },
  });
  if (targetYear?.isLocked) {
    return {
      ok: false,
      message: `${targetYear.name} is locked. Unlock it before promoting into it.`,
    };
  }

  const enrollments = await db.enrollment.findMany({
    where: { sectionId: source.id, isActive: true },
    select: {
      id: true,
      rollNumber: true,
      student: {
        select: { id: true, firstName: true, lastName: true, admissionNo: true },
      },
    },
  });

  if (enrollments.length === 0) {
    return { ok: false, message: "That class has no active students." };
  }

  const decisionFor = (studentId: string): Outcome => outcomes.get(studentId) ?? "PROMOTED";

  const skipped: string[] = [];

  // A student may already have been given a place in the target year by an
  // earlier run or by a one-off move. Re-promoting would break the unique
  // constraint and abort the batch, so they are reported and left alone.
  const existing = await db.enrollment.findMany({
    where: {
      academicYearId: target.academicYearId,
      studentId: { in: enrollments.map((item) => item.student.id) },
    },
    select: { studentId: true },
  });
  const alreadyPlaced = new Set(existing.map((row) => row.studentId));

  const movers = enrollments.filter((enrollment) => {
    const name =
      `${enrollment.student.firstName} ${enrollment.student.lastName ?? ""}`.trim();
    if (alreadyPlaced.has(enrollment.student.id)) {
      skipped.push(`${name} — already enrolled in ${targetYear?.name ?? "that year"}`);
      return false;
    }
    return true;
  });

  // Where a retained student goes.
  //
  // Sections belong to one academic year, so "the class they were in" means the
  // next year's copy of it — the same grade and section name — not the row the
  // year just ended with. Enrolling them in the old year's section would create
  // the only kind of enrollment the rest of the app does not expect: one whose
  // academic year differs from its section's. Nothing would list it for the new
  // year, so a retained child would be as invisible to attendance and fees as
  // one left with no enrollment at all.
  const retainedIn = movers.filter(
    (enrollment) => decisionFor(enrollment.student.id) === "RETAINED",
  ).length;

  let retention: { id: string; capacity: number; filled: number } | null = null;
  if (retainedIn > 0) {
    const sameClassNextYear = await db.section.findFirst({
      where: {
        academicYearId: target.academicYearId,
        classLevelId: source.classLevelId,
        name: source.name,
      },
      select: {
        id: true,
        capacity: true,
        _count: { select: { enrollments: { where: { isActive: true } } } },
      },
    });
    if (!sameClassNextYear) {
      return {
        ok: false,
        message: `${source.classLevel.name} ${source.name} does not exist in ${targetYear?.name ?? "that year"}, so nobody can repeat it. Create that section first, or choose another outcome.`,
        skipped,
      };
    }
    retention = {
      id: sameClassNextYear.id,
      capacity: sameClassNextYear.capacity,
      filled: sameClassNextYear._count.enrollments,
    };
  }

  // Capacity, per receiving section. Promotions and retentions can land in the
  // same one — promoting Grade 1 A into next year's Grade 1 A is a legal if
  // unusual run — so they are counted together rather than checked twice.
  const receiving = new Map<
    string,
    { label: string; capacity: number; filled: number; incoming: number }
  >([
    [
      target.id,
      {
        label: `${target.classLevel.name} ${target.name}`,
        capacity: target.capacity,
        filled: target._count.enrollments,
        incoming: 0,
      },
    ],
  ]);
  if (retention && !receiving.has(retention.id)) {
    receiving.set(retention.id, {
      label: `${source.classLevel.name} ${source.name}`,
      capacity: retention.capacity,
      filled: retention.filled,
      incoming: 0,
    });
  }
  for (const enrollment of movers) {
    const outcome = decisionFor(enrollment.student.id);
    const sectionId =
      outcome === "PROMOTED" ? target.id : outcome === "RETAINED" ? retention!.id : null;
    if (sectionId) receiving.get(sectionId)!.incoming += 1;
  }

  if (!allowOverfill) {
    for (const seats of receiving.values()) {
      const projected = seats.filled + seats.incoming;
      if (projected > seats.capacity) {
        return {
          ok: false,
          message: `${seats.label} would hold ${projected} of ${seats.capacity} places. Choose another section, or allow over capacity.`,
          skipped,
        };
      }
    }
  }

  await db.$transaction(async (tx) => {
    for (const enrollment of movers) {
      const outcome = decisionFor(enrollment.student.id);

      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { isActive: false, leftOn: new Date(), outcome },
      });

      if (outcome === "PROMOTED" || outcome === "RETAINED") {
        await tx.enrollment.create({
          data: {
            schoolId: actor.schoolId,
            studentId: enrollment.student.id,
            // A retained student repeats the year in the same class — next
            // year's copy of it, resolved above.
            sectionId: outcome === "PROMOTED" ? target.id : retention!.id,
            academicYearId: target.academicYearId,
            rollNumber: enrollment.rollNumber,
            isActive: true,
          },
        });
      } else {
        // Off the roll: ALUMNI for a leaver who finished, TRANSFERRED for one
        // who left mid-school. Both stamp an exit date for the reports.
        await tx.student.update({
          where: { id: enrollment.student.id },
          data: {
            status: outcome === "PASSED_OUT" ? "ALUMNI" : "TRANSFERRED",
            exitDate: new Date(),
          },
        });
      }
    }
  });

  await recordAudit({
    schoolId: actor.schoolId,
    userId: actor.userId,
    action: "students.promote.bulk",
    entityType: "Section",
    entityId: source.id,
    before: { from: `${source.classLevel.name} ${source.name}` },
    after: {
      to: `${target.classLevel.name} ${target.name}`,
      moved: movers.length,
      skipped: skipped.length,
    },
  });

  return {
    ok: true,
    moved: movers.length,
    skipped,
    message: `${movers.length} student${movers.length === 1 ? "" : "s"} processed from ${source.classLevel.name} ${source.name}.`,
  };
}
