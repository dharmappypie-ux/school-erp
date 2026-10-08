import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { teacherCanAccessSection } from "@/lib/teacher-sections";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  sectionId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date"),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["PRESENT", "ABSENT", "LATE", "HALF_DAY", "EXCUSED", "ON_LEAVE"]),
      }),
    )
    .min(1, "Nothing to save"),
});

/**
 * POST /api/mobile/v1/teacher/attendance
 *
 * The mobile mirror of the web `saveAttendance` action: upserts one record per
 * student for the day (unique on [studentId, date]), accepting only students
 * actually enrolled in the target section. Source is tagged MOBILE_APP.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "attendance.mark");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    ));
  }

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  if (!yearId) {
    return cors(NextResponse.json({ error: "No academic year is marked current." }, { status: 409 }));
  }

  const { sectionId, date, entries } = parsed.data;
  const day = new Date(`${date}T00:00:00.000Z`);

  const section = await db.section.findUnique({ where: { id: sectionId }, select: { id: true } });
  if (!section) {
    return cors(NextResponse.json({ error: "That section is not in your school." }, { status: 404 }));
  }
  if (!(await teacherCanAccessSection(db, session.staffId, session.permissions, sectionId, yearId))) {
    return cors(NextResponse.json({ error: "That class is not one of yours." }, { status: 403 }));
  }

  const enrolled = await db.enrollment.findMany({
    where: { sectionId, academicYearId: yearId, isActive: true },
    select: { studentId: true },
  });
  const allowed = new Set(enrolled.map((e) => e.studentId));
  const accepted = entries.filter((e) => allowed.has(e.studentId));
  if (accepted.length === 0) {
    return cors(NextResponse.json(
      { error: "None of those students are enrolled in this section." },
      { status: 400 },
    ));
  }

  await db.$transaction(
    accepted.map((entry) =>
      db.attendanceRecord.upsert({
        where: { studentId_date: { studentId: entry.studentId, date: day } },
        create: {
          schoolId: session.schoolId,
          studentId: entry.studentId,
          sectionId,
          academicYearId: yearId,
          date: day,
          status: entry.status,
          source: "MOBILE_APP",
          markedById: session.staffId,
        },
        update: {
          status: entry.status,
          sectionId,
          source: "MOBILE_APP",
          markedById: session.staffId,
        },
      }),
    ),
  );

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "attendance.mark",
    entityType: "Section",
    entityId: sectionId,
    after: {
      date,
      count: accepted.length,
      absent: accepted.filter((e) => e.status === "ABSENT").length,
      via: "mobile",
    },
  });

  const skipped = entries.length - accepted.length;
  return cors(NextResponse.json({
    ok: true,
    saved: accepted.length,
    skipped,
    message: skipped > 0
      ? `Saved ${accepted.length} records. ${skipped} ignored — not enrolled.`
      : `Saved attendance for ${accepted.length} students.`,
  }));
}
