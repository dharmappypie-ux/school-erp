import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { teacherCanAccessSection } from "@/lib/teacher-sections";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/teacher/exams/roster?examId=&sectionId=
 * Students of the section with any marks already recorded for this exam.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["marks.enter", "marks.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const url = new URL(req.url);
  const examId = url.searchParams.get("examId");
  const sectionId = url.searchParams.get("sectionId");
  if (!examId || !sectionId) {
    return cors(NextResponse.json({ error: "examId and sectionId are required" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  if (!(await teacherCanAccessSection(db, session.staffId, session.permissions, sectionId, yearId))) {
    return cors(NextResponse.json({ error: "That class is not one of yours." }, { status: 403 }));
  }

  const exam = await db.exam.findUnique({ where: { id: examId }, select: { id: true, maxMarks: true } });
  if (!exam) return cors(NextResponse.json({ error: "Exam not found in your school." }, { status: 404 }));

  const [enrollments, marks] = await Promise.all([
    db.enrollment.findMany({
      where: { sectionId, isActive: true, ...(yearId ? { academicYearId: yearId } : {}) },
      select: {
        student: { select: { id: true, firstName: true, lastName: true, rollNumber: true, admissionNo: true } },
      },
    }),
    db.markEntry.findMany({
      where: { examId },
      select: { studentId: true, marksObtained: true, isAbsent: true },
    }),
  ]);

  const byStudent = new Map(marks.map((m) => [m.studentId, m]));

  const students = enrollments
    .map((e) => e.student)
    .sort((a, b) => (a.rollNumber ?? "").localeCompare(b.rollNumber ?? "", undefined, { numeric: true }))
    .map((s) => {
      const m = byStudent.get(s.id);
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
        rollNumber: s.rollNumber,
        marks: m && m.marksObtained != null ? toNumber(m.marksObtained) : null,
        isAbsent: m?.isAbsent ?? false,
      };
    });

  return cors(NextResponse.json({ maxMarks: toNumber(exam.maxMarks), students }));
}
