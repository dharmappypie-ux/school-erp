import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { WEEK, generateTimetable, type PlacedSlot, type Requirement, type Weekday } from "@/lib/timetable";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  classLevelId: z.string().optional(),
  workingDays: z.coerce.number().int().min(1).max(7).default(6),
});

/**
 * POST /api/mobile/v1/admin/timetable/generate — generate the weekly grid from
 * the subject→class assignments, with clash detection. Mirror of the web
 * `generateTimetableFor`. Gated on timetable.manage.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "timetable.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  if (!session.academicYearId) {
    return cors(NextResponse.json({ error: "No academic year is marked current." }, { status: 409 }));
  }
  const academicYearId = session.academicYearId;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { classLevelId, workingDays } = parsed.data;

  const db = scopedDb(session.schoolId);
  const [sections, periods] = await Promise.all([
    db.section.findMany({
      where: { academicYearId, ...(classLevelId ? { classLevelId } : {}) },
      select: { id: true, name: true, classLevelId: true },
    }),
    db.period.findMany({ orderBy: { sequence: "asc" }, select: { id: true, sequence: true, isBreak: true } }),
  ]);

  if (sections.length === 0) return cors(NextResponse.json({ error: "No sections found for this year." }, { status: 400 }));
  if (periods.filter((p) => !p.isBreak).length === 0) {
    return cors(NextResponse.json({ error: "No teaching periods are configured." }, { status: 400 }));
  }

  const classSubjects = await db.classSubject.findMany({
    where: { classLevelId: { in: [...new Set(sections.map((s) => s.classLevelId))] } },
    select: { classLevelId: true, sectionId: true, subjectId: true, teacherId: true, weeklyPeriods: true },
  });
  if (classSubjects.length === 0) {
    return cors(NextResponse.json({ error: "No subjects are mapped to these classes yet, so there is nothing to schedule." }, { status: 400 }));
  }

  const requirements: Requirement[] = [];
  for (const section of sections) {
    for (const entry of classSubjects) {
      if (entry.classLevelId !== section.classLevelId) continue;
      if (entry.sectionId && entry.sectionId !== section.id) continue;
      requirements.push({
        sectionId: section.id, subjectId: entry.subjectId,
        teacherId: entry.teacherId, periodsPerWeek: entry.weeklyPeriods,
      });
    }
  }

  const days: Weekday[] = WEEK.slice(0, workingDays);
  const report = generateTimetable(requirements, periods, { days, seed: 20260401, attempts: 8 });

  if (report.conflicts.length > 0) {
    return cors(NextResponse.json(
      { error: `Generation produced ${report.conflicts.length} conflicts and was discarded. Nothing was changed.` },
      { status: 409 },
    ));
  }

  const sectionIds = sections.map((s) => s.id);
  await db.$transaction(async (tx) => {
    await tx.timetableSlot.deleteMany({ where: { academicYearId, sectionId: { in: sectionIds } } });
    await tx.timetableSlot.createMany({
      data: report.slots.map((slot: PlacedSlot) => ({
        schoolId: session.schoolId, academicYearId,
        sectionId: slot.sectionId, periodId: slot.periodId,
        subjectId: slot.subjectId, teacherId: slot.teacherId, dayOfWeek: slot.dayOfWeek,
      })),
    });
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "timetable.generate", entityType: "AcademicYear", entityId: academicYearId,
    after: { sections: sections.length, placed: report.placed, requested: report.requested, via: "mobile" },
  });

  const shortfall = report.shortfalls.reduce((sum, e) => sum + e.missing, 0);
  return cors(NextResponse.json({
    ok: true,
    message: shortfall === 0
      ? `Scheduled all ${report.placed} periods across ${sections.length} sections with no clashes.`
      : `Scheduled ${report.placed} of ${report.requested} periods across ${sections.length} sections. ${shortfall} could not be placed — not enough free slots.`,
  }));
}
