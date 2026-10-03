import "server-only";

import { toNumber } from "@/lib/format";
import type { CatalogItem, LearningSignals } from "@/lib/ai/recommend";
import type { ScopedDb } from "@/lib/tenant";

/**
 * Data-gathering for the personalized learning plan. Kept out of the page and
 * the action so both build the plan from exactly the same signals. Everything
 * is scoped to one child, whose id the caller has already verified belongs to
 * the viewer.
 */

/** The child's class level for this year, used to pick which courses/quizzes apply. */
export async function classLevelForStudent(
  db: ScopedDb,
  studentId: string,
  yearId: string | null | undefined,
): Promise<string | null> {
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { section: { select: { classLevelId: true } } },
  });
  return enrollment?.section.classLevelId ?? null;
}

export async function gatherLearningSignals(
  db: ScopedDb,
  student: { id: string; name: string },
  yearId: string | null | undefined,
  schoolId: string,
): Promise<LearningSignals> {
  const [marks, quizAttempts, attendance, homework] = await Promise.all([
    // markEntry is tenant-scoped; filtered to this student.
    db.markEntry.findMany({
      where: { studentId: student.id },
      select: {
        marksObtained: true,
        exam: { select: { maxMarks: true, subject: { select: { id: true, name: true } } } },
      },
    }),
    // tenant-safe: bounded to the child, and to this school through quiz.schoolId.
    db.quizAttempt.findMany({
      where: { studentId: student.id, quiz: { schoolId }, completedAt: { not: null } },
      select: { score: true, totalPoints: true },
    }),
    // attendanceRecord is tenant-scoped; filtered to this student and year.
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: student.id, ...(yearId ? { academicYearId: yearId } : {}) },
      _count: { _all: true },
    }),
    // tenant-safe: homeworkSubmission reaches its tenant via the student, and
    // this is filtered to the caller's already-verified child.
    db.homeworkSubmission.groupBy({
      by: ["status"],
      where: { studentId: student.id },
      _count: { _all: true },
    }),
  ]);

  // Subject-wise averages.
  const bySubject = new Map<string, { name: string; percents: number[] }>();
  for (const mark of marks) {
    const max = toNumber(mark.exam.maxMarks);
    if (max <= 0) continue;
    const subject = mark.exam.subject;
    const entry = bySubject.get(subject.id) ?? { name: subject.name, percents: [] };
    entry.percents.push((toNumber(mark.marksObtained) / max) * 100);
    bySubject.set(subject.id, entry);
  }
  const subjects = [...bySubject.entries()].map(([subjectId, value]) => ({
    subjectId,
    subjectName: value.name,
    averagePercent:
      value.percents.reduce((sum, p) => sum + p, 0) / Math.max(1, value.percents.length),
    assessments: value.percents.length,
  }));

  // Quiz average.
  const quizzesTaken = quizAttempts.length;
  const quizAveragePercent =
    quizzesTaken > 0
      ? quizAttempts.reduce(
          (sum, a) => sum + (a.totalPoints > 0 ? (a.score / a.totalPoints) * 100 : 0),
          0,
        ) / quizzesTaken
      : null;

  // Attendance rate.
  let attTotal = 0;
  let attPresent = 0;
  for (const row of attendance) {
    attTotal += row._count._all;
    if (row.status === "PRESENT" || row.status === "LATE") attPresent += row._count._all;
  }
  const attendanceRate = attTotal > 0 ? (attPresent / attTotal) * 100 : null;

  // Homework miss rate.
  let hwTotal = 0;
  let hwMissed = 0;
  for (const row of homework) {
    hwTotal += row._count._all;
    if (row.status === "ASSIGNED" || row.status === "MISSING") hwMissed += row._count._all;
  }
  const homeworkMissedRate = hwTotal >= 3 ? hwMissed / hwTotal : null;

  return {
    name: student.name,
    subjects,
    quizAveragePercent,
    quizzesTaken,
    attendanceRate,
    homeworkMissedRate,
  };
}

export async function gatherCatalog(
  db: ScopedDb,
  classLevelId: string | null,
): Promise<{ courses: CatalogItem[]; quizzes: CatalogItem[] }> {
  const classFilter = {
    OR: [{ classLevelId: null }, ...(classLevelId ? [{ classLevelId }] : [])],
  };

  const [courses, quizzes] = await Promise.all([
    db.course.findMany({
      where: { status: "PUBLISHED", ...classFilter },
      orderBy: { publishedAt: "desc" },
      select: { id: true, title: true, subjectId: true },
    }),
    db.quiz.findMany({
      where: { status: "PUBLISHED", ...classFilter },
      orderBy: { publishedAt: "desc" },
      select: { id: true, title: true, subjectId: true },
    }),
  ]);

  return { courses, quizzes };
}
