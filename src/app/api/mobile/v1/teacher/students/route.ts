import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/teacher/students?sectionId=…&date=YYYY-MM-DD
 *
 * The active roster of a section, in roll-number order — the list a teacher
 * marks attendance against or sets homework for. When `date` is given, each
 * student carries any attendance already recorded that day so the register
 * opens pre-filled rather than blank.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["attendance.mark", "marks.enter", "homework.manage", "exams.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const url = new URL(req.url);
  const sectionId = url.searchParams.get("sectionId");
  const date = url.searchParams.get("date");
  if (!sectionId) {
    return cors(NextResponse.json({ error: "sectionId is required" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const enrollments = await db.enrollment.findMany({
    where: { sectionId, isActive: true, ...(yearId ? { academicYearId: yearId } : {}) },
    select: {
      rollNumber: true,
      student: {
        select: { id: true, firstName: true, lastName: true, admissionNo: true, rollNumber: true },
      },
    },
  });

  // Any attendance already recorded for that day.
  const marks = new Map<string, string>();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const day = new Date(`${date}T00:00:00.000Z`);
    const records = await db.attendanceRecord.findMany({
      where: { sectionId, date: day },
      select: { studentId: true, status: true },
    });
    for (const r of records) marks.set(r.studentId, r.status);
  }

  const students = enrollments
    .map((e) => ({
      id: e.student.id,
      name: `${e.student.firstName} ${e.student.lastName ?? ""}`.trim(),
      admissionNo: e.student.admissionNo,
      rollNumber: e.rollNumber ?? e.student.rollNumber ?? "",
      status: marks.get(e.student.id) ?? null,
    }))
    .sort((a, b) => {
      const ra = Number(a.rollNumber) || 0;
      const rb = Number(b.rollNumber) || 0;
      if (ra && rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });

  return cors(NextResponse.json({ students }));
}
