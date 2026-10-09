"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export interface PromotionState {
  ok: boolean;
  message: string;
  /** Per-student lines explaining anything that was not moved. */
  skipped?: string[];
  moved?: number;
}

/**
 * What happens to one student at the end of the year.
 *
 * RETAINED repeats the year in the same class, so it still creates an
 * enrollment in the new year — just pointing at the old section. PASSED_OUT and
 * TRANSFERRED create nothing: the student leaves the roll.
 */
const OUTCOMES = ["PROMOTED", "RETAINED", "PASSED_OUT", "TRANSFERRED"] as const;
type Outcome = (typeof OUTCOMES)[number];

const PromoteSchema = z.object({
  sourceSectionId: z.string().min(1, "Choose the class to promote from"),
  targetSectionId: z.string().min(1, "Choose the class to promote into"),
  allowOverfill: z.string().optional(),
});

/**
 * Promotes a whole class at once.
 *
 * The year rollover is the largest single operation a school performs, and it
 * is the one most dangerous to get half-right: a partially promoted class
 * leaves students with no active enrollment, invisible to attendance and fees.
 * So the whole run is one transaction — every student moves or none does.
 */
export async function promoteClass(
  _previous: PromotionState,
  formData: FormData,
): Promise<PromotionState> {
  const parsed = PromoteSchema.safeParse({
    sourceSectionId: formData.get("sourceSectionId"),
    targetSectionId: formData.get("targetSectionId"),
    allowOverfill: formData.get("allowOverfill") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the selected classes.",
    };
  }

  const session = await requirePermission("students.update");
  const db = scopedDb(session.schoolId);
  const { sourceSectionId, targetSectionId } = parsed.data;
  const allowOverfill = parsed.data.allowOverfill === "true";

  if (sourceSectionId === targetSectionId) {
    return {
      ok: false,
      message: "The target class is the same as the source class.",
    };
  }

  const [source, target] = await Promise.all([
    db.section.findUnique({
      where: { id: sourceSectionId },
      select: {
        id: true,
        name: true,
        academicYearId: true,
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

  // Per-student decisions come back as outcome:<studentId>.
  const decisions = new Map<string, Outcome>();
  for (const enrollment of enrollments) {
    const raw = String(
      formData.get(`outcome:${enrollment.student.id}`) ?? "PROMOTED",
    );
    decisions.set(
      enrollment.student.id,
      (OUTCOMES as readonly string[]).includes(raw)
        ? (raw as Outcome)
        : "PROMOTED",
    );
  }

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

  const incoming = movers.filter(
    (enrollment) =>
      decisions.get(enrollment.student.id) === "PROMOTED" ||
      decisions.get(enrollment.student.id) === "RETAINED",
  );
  const promotedIn = incoming.filter(
    (enrollment) => decisions.get(enrollment.student.id) === "PROMOTED",
  ).length;

  const projected = target._count.enrollments + promotedIn;
  if (projected > target.capacity && !allowOverfill) {
    return {
      ok: false,
      message: `${target.classLevel.name} ${target.name} would hold ${projected} of ${target.capacity} places. Choose another section, or tick “allow over capacity”.`,
      skipped,
    };
  }

  await db.$transaction(async (tx) => {
    for (const enrollment of movers) {
      const outcome = decisions.get(enrollment.student.id) ?? "PROMOTED";

      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { isActive: false, leftOn: new Date(), outcome },
      });

      if (outcome === "PROMOTED" || outcome === "RETAINED") {
        await tx.enrollment.create({
          data: {
            schoolId: session.schoolId,
            studentId: enrollment.student.id,
            // A retained student repeats the year in the class they were in.
            sectionId: outcome === "PROMOTED" ? target.id : source.id,
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
    schoolId: session.schoolId,
    userId: session.userId,
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

  revalidatePath("/students");
  revalidatePath("/students/promote");

  return {
    ok: true,
    moved: movers.length,
    skipped,
    message: `${movers.length} student${movers.length === 1 ? "" : "s"} processed from ${source.classLevel.name} ${source.name}.`,
  };
}
