import "server-only";

import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/format";
import {
  assignRanks,
  computeTotals,
  resolveGrade,
  summariseSubject,
  type SubjectMark,
  type SubjectSummary,
} from "@/lib/grading-core";

/**
 * Report-card generation. The grading rules themselves live in
 * `@/lib/grading-core`, which is pure and unit-tested; this module only adds
 * the database reads and writes around them.
 */

export * from "@/lib/grading-core";

/* -------------------------------------------------------------------------- */
/* Generation                                                                  */
/* -------------------------------------------------------------------------- */

export interface GenerationResult {
  generated: number;
  skipped: number;
  message: string;
}

/**
 * Builds (or rebuilds) report cards for every student in a section for one term.
 *
 * Existing cards are updated rather than duplicated, except published ones,
 * which are left untouched — a card a parent has already seen must not change
 * silently underneath them.
 */
export async function generateReportCards(input: {
  schoolId: string;
  academicYearId: string;
  termId: string;
  sectionId: string;
}): Promise<GenerationResult> {
  const { schoolId, academicYearId, termId, sectionId } = input;

  const section = await prisma.section.findFirst({
    where: { id: sectionId, schoolId, academicYearId },
    select: { id: true, classLevelId: true },
  });
  if (!section) {
    return { generated: 0, skipped: 0, message: "Section not found for this year." };
  }

  const [term, scheme, enrollments, exams] = await Promise.all([
    prisma.examTerm.findFirst({
      where: { id: termId, schoolId, academicYearId },
      select: { id: true, name: true },
    }),
    prisma.gradingScheme.findFirst({
      where: { schoolId, isDefault: true },
      include: { bands: true },
    }),
    prisma.enrollment.findMany({
      where: { sectionId, academicYearId, isActive: true },
      select: { studentId: true },
    }),
    prisma.exam.findMany({
      where: { schoolId, termId, classLevelId: section.classLevelId },
      select: {
        id: true,
        maxMarks: true,
        weightage: true,
        subjectId: true,
        subject: { select: { id: true, name: true, isGraded: true } },
      },
    }),
  ]);

  if (!term) return { generated: 0, skipped: 0, message: "Term not found." };
  if (!scheme) {
    return {
      generated: 0,
      skipped: 0,
      message: "No default grading scheme is configured for this school.",
    };
  }
  if (exams.length === 0) {
    return {
      generated: 0,
      skipped: 0,
      message: `No exams exist for this class in ${term.name}.`,
    };
  }
  if (enrollments.length === 0) {
    return { generated: 0, skipped: 0, message: "No active students in this section." };
  }

  const studentIds = enrollments.map((enrollment) => enrollment.studentId);
  const examById = new Map(exams.map((exam) => [exam.id, exam]));

  const [marks, attendance, published] = await Promise.all([
    prisma.markEntry.findMany({
      where: { schoolId, examId: { in: exams.map((exam) => exam.id) }, studentId: { in: studentIds } },
      select: { studentId: true, examId: true, marksObtained: true, isAbsent: true },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["studentId", "status"],
      where: { schoolId, academicYearId, studentId: { in: studentIds } },
      _count: { _all: true },
    }),
    prisma.reportCard.findMany({
      where: { schoolId, termId, studentId: { in: studentIds }, isPublished: true },
      select: { studentId: true },
    }),
  ]);

  const lockedStudents = new Set(published.map((card) => card.studentId));

  const attendanceByStudent = new Map<string, { total: number; present: number }>();
  for (const row of attendance) {
    const entry = attendanceByStudent.get(row.studentId) ?? { total: 0, present: 0 };
    entry.total += row._count._all;
    if (row.status === "PRESENT" || row.status === "LATE") entry.present += row._count._all;
    attendanceByStudent.set(row.studentId, entry);
  }

  const marksByStudent = new Map<string, typeof marks>();
  for (const mark of marks) {
    marksByStudent.set(mark.studentId, [...(marksByStudent.get(mark.studentId) ?? []), mark]);
  }

  // Compute every student first so ranks can be assigned across the section.
  const computed = studentIds
    .filter((studentId) => !lockedStudents.has(studentId))
    .map((studentId) => {
      const bySubject = new Map<string, SubjectMark[]>();

      for (const mark of marksByStudent.get(studentId) ?? []) {
        const exam = examById.get(mark.examId);
        if (!exam) continue;
        const entry: SubjectMark = {
          subjectId: exam.subject.id,
          subjectName: exam.subject.name,
          isGraded: exam.subject.isGraded,
          maxMarks: toNumber(exam.maxMarks),
          obtainedMarks: mark.isAbsent ? null : toNumber(mark.marksObtained),
          isAbsent: mark.isAbsent,
          weightage: toNumber(exam.weightage) || 100,
        };
        bySubject.set(exam.subject.id, [...(bySubject.get(exam.subject.id) ?? []), entry]);
      }

      const subjects = [...bySubject.values()]
        .map(summariseSubject)
        .filter((summary): summary is SubjectSummary => summary !== null);

      const totals = computeTotals(subjects, scheme.bands);
      const attendanceEntry = attendanceByStudent.get(studentId);

      return { studentId, subjects, totals, attendanceEntry };
    })
    .filter((row) => row.subjects.length > 0);

  const ranks = assignRanks(
    computed.map((row) => ({ ...row, percentage: row.totals.percentage })),
  );
  const rankByStudent = new Map<string, number>();
  for (const [row, rank] of ranks) rankByStudent.set(row.studentId, rank);

  for (const row of computed) {
    const overallGrade = resolveGrade(row.totals.percentage, scheme.bands);

    const card = await prisma.reportCard.upsert({
      where: { studentId_termId: { studentId: row.studentId, termId } },
      create: {
        schoolId,
        studentId: row.studentId,
        academicYearId,
        termId,
        schemeId: scheme.id,
        totalMarks: row.totals.totalMarks,
        obtainedMarks: row.totals.obtainedMarks,
        percentage: row.totals.percentage,
        grade: overallGrade?.grade ?? null,
        gpa: row.totals.gpa,
        rank: rankByStudent.get(row.studentId) ?? null,
        result: row.totals.result,
        attendancePresent: row.attendanceEntry?.present ?? null,
        attendanceTotal: row.attendanceEntry?.total ?? null,
      },
      update: {
        schemeId: scheme.id,
        totalMarks: row.totals.totalMarks,
        obtainedMarks: row.totals.obtainedMarks,
        percentage: row.totals.percentage,
        grade: overallGrade?.grade ?? null,
        gpa: row.totals.gpa,
        rank: rankByStudent.get(row.studentId) ?? null,
        result: row.totals.result,
        attendancePresent: row.attendanceEntry?.present ?? null,
        attendanceTotal: row.attendanceEntry?.total ?? null,
      },
      select: { id: true },
    });

    // Replace the lines wholesale: a subject dropped since the last run must
    // not linger on the card.
    await prisma.reportCardLine.deleteMany({ where: { reportCardId: card.id } });
    await prisma.reportCardLine.createMany({
      data: row.subjects.map((subject) => {
        const grade = subject.percentage === null
          ? null
          : resolveGrade(subject.percentage, scheme.bands);
        return {
          reportCardId: card.id,
          subjectId: subject.subjectId,
          maxMarks: subject.maxMarks,
          obtainedMarks: subject.obtainedMarks,
          percentage: subject.percentage,
          grade: grade?.grade ?? null,
          gradePoint: grade?.gradePoint ?? null,
          remarks: subject.wasAbsent ? "Absent" : (grade?.remark ?? null),
        };
      }),
    });
  }

  return {
    generated: computed.length,
    skipped: lockedStudents.size,
    message:
      lockedStudents.size > 0
        ? `Generated ${computed.length} report cards. ${lockedStudents.size} already published and left unchanged.`
        : `Generated ${computed.length} report cards for ${term.name}.`,
  };
}
