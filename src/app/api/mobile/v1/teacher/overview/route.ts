import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/teacher/overview
 *
 * Headline counts for the teacher dashboard: classes they own, students in
 * those classes, assignments they've set, and submissions waiting to be graded.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["attendance.read", "homework.read", "academics.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  const staffId = session.staffId;

  const ownedSections = staffId
    ? await db.section.findMany({
        where: { classTeacherId: staffId, ...(yearId ? { academicYearId: yearId } : {}) },
        select: { id: true },
      })
    : [];

  let sectionCount = ownedSections.length;
  let studentCount: number;
  if (ownedSections.length > 0) {
    studentCount = await db.enrollment.count({
      where: {
        sectionId: { in: ownedSections.map((s) => s.id) },
        isActive: true,
        ...(yearId ? { academicYearId: yearId } : {}),
      },
    });
  } else {
    // Fallback snapshot when the account has no class-teacher sections.
    sectionCount = await db.section.count({ where: yearId ? { academicYearId: yearId } : {} });
    studentCount = await db.enrollment.count({
      where: { isActive: true, ...(yearId ? { academicYearId: yearId } : {}) },
    });
  }

  const [homeworkCount, toGrade] = await Promise.all([
    db.homework.count({ where: staffId ? { authorId: staffId } : {} }),
    db.homeworkSubmission.count({
      where: {
        status: { in: ["SUBMITTED", "LATE"] },
        homework: staffId ? { authorId: staffId, schoolId: session.schoolId } : { schoolId: session.schoolId },
      },
    }),
  ]);

  return cors(NextResponse.json({
    teacherName: session.name,
    schoolName: session.schoolName,
    sections: sectionCount,
    students: studentCount,
    homework: homeworkCount,
    toGrade,
  }));
}
