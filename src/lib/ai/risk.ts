import "server-only";

import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/format";
import type { RiskLevel } from "@/generated/prisma/enums";

/**
 * Dropout-risk scoring.
 *
 * Deliberately a transparent weighted model rather than an opaque one: a school
 * acting on "this child may drop out" has to be able to say why, and defend it
 * to a parent. Every signal contributes a bounded, individually reportable
 * number of points, and the stored `factors` payload keeps that breakdown for
 * the UI.
 *
 * Signals (max 100 points):
 *   attendance      0–35   strongest single predictor of disengagement
 *   academic        0–25   sustained low marks, and decline between terms
 *   fee arrears     0–20   financial distress at home
 *   homework        0–12   day-to-day engagement
 *   discipline      0–8    library fines and unreturned property as a proxy
 */

export interface RiskFactor {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface RiskAssessment {
  studentId: string;
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  explanation: string;
  recommendations: string[];
}

function levelFor(score: number): RiskLevel {
  if (score >= 70) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 28) return "MEDIUM";
  return "LOW";
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value * 10) / 10));
}

export interface StudentSignals {
  studentId: string;
  name: string;
  attendanceTotal: number;
  attendancePresent: number;
  /** Longest run of consecutive absences in the window. */
  longestAbsenceRun: number;
  averagePercent: number | null;
  /** Change in average percentage between the two most recent terms. */
  percentDelta: number | null;
  feeOutstanding: number;
  feeBilled: number;
  daysOverdue: number;
  homeworkAssigned: number;
  homeworkMissed: number;
  libraryOverdue: number;
}

/** Scores one student from pre-gathered signals. Pure — trivially testable. */
export function assessRisk(signals: StudentSignals): RiskAssessment {
  const factors: RiskFactor[] = [];

  // -- Attendance ----------------------------------------------------------
  const attendanceRate =
    signals.attendanceTotal > 0
      ? (signals.attendancePresent / signals.attendanceTotal) * 100
      : 100;

  let attendancePoints = 0;
  if (signals.attendanceTotal >= 5) {
    // Nothing below 95%; then ramps steeply, since attendance under ~60% is
    // the clearest signal a student is disengaging.
    attendancePoints = clamp(((95 - attendanceRate) / 45) * 28, 28);
    if (signals.longestAbsenceRun >= 5) attendancePoints = clamp(attendancePoints + 7, 35);
    else if (signals.longestAbsenceRun >= 3) attendancePoints = clamp(attendancePoints + 3.5, 35);
  }
  factors.push({
    key: "attendance",
    label: "Attendance",
    points: attendancePoints,
    maxPoints: 35,
    detail:
      signals.attendanceTotal < 5
        ? "Not enough attendance recorded to assess"
        : `${attendanceRate.toFixed(1)}% present across ${signals.attendanceTotal} sessions` +
          (signals.longestAbsenceRun >= 3
            ? `, with a run of ${signals.longestAbsenceRun} consecutive absences`
            : ""),
  });

  // -- Academic ------------------------------------------------------------
  let academicPoints = 0;
  if (signals.averagePercent !== null) {
    academicPoints = clamp(((55 - signals.averagePercent) / 40) * 17, 17);
    if (signals.percentDelta !== null && signals.percentDelta < -8) {
      academicPoints = clamp(academicPoints + Math.min(8, Math.abs(signals.percentDelta) / 3), 25);
    }
  }
  factors.push({
    key: "academic",
    label: "Academic performance",
    points: academicPoints,
    maxPoints: 25,
    detail:
      signals.averagePercent === null
        ? "No assessment results recorded"
        : `Averaging ${signals.averagePercent.toFixed(1)}%` +
          (signals.percentDelta !== null
            ? `, ${signals.percentDelta >= 0 ? "up" : "down"} ${Math.abs(signals.percentDelta).toFixed(1)} points on the previous term`
            : ""),
  });

  // -- Fees ----------------------------------------------------------------
  let feePoints = 0;
  if (signals.feeOutstanding > 0) {
    const arrearsRatio =
      signals.feeBilled > 0 ? signals.feeOutstanding / signals.feeBilled : 0;
    feePoints = clamp(arrearsRatio * 12, 12);
    if (signals.daysOverdue > 90) feePoints = clamp(feePoints + 8, 20);
    else if (signals.daysOverdue > 30) feePoints = clamp(feePoints + 4, 20);
  }
  factors.push({
    key: "fees",
    label: "Fee arrears",
    points: feePoints,
    maxPoints: 20,
    detail:
      signals.feeOutstanding <= 0
        ? "Fees up to date"
        : `${signals.feeOutstanding.toFixed(0)} outstanding` +
          (signals.daysOverdue > 0 ? `, ${signals.daysOverdue} days past due` : ""),
  });

  // -- Homework ------------------------------------------------------------
  let homeworkPoints = 0;
  if (signals.homeworkAssigned >= 3) {
    const missRate = signals.homeworkMissed / signals.homeworkAssigned;
    homeworkPoints = clamp(missRate * 12, 12);
  }
  factors.push({
    key: "homework",
    label: "Homework submission",
    points: homeworkPoints,
    maxPoints: 12,
    detail:
      signals.homeworkAssigned < 3
        ? "Too few assignments to assess"
        : `${signals.homeworkMissed} of ${signals.homeworkAssigned} assignments not submitted`,
  });

  // -- Discipline proxy ----------------------------------------------------
  const disciplinePoints = clamp(signals.libraryOverdue * 2.5, 8);
  factors.push({
    key: "conduct",
    label: "Conduct indicators",
    points: disciplinePoints,
    maxPoints: 8,
    detail:
      signals.libraryOverdue === 0
        ? "No outstanding school property"
        : `${signals.libraryOverdue} library ${signals.libraryOverdue === 1 ? "item" : "items"} overdue`,
  });

  const score = Math.round(
    factors.reduce((sum, factor) => sum + factor.points, 0) * 10,
  ) / 10;
  const level = levelFor(score);

  const leading = [...factors]
    .filter((factor) => factor.points > 0)
    .sort((a, b) => b.points - a.points);

  const explanation =
    leading.length === 0
      ? `${signals.name} shows no risk indicators on the tracked signals.`
      : `${signals.name} scores ${score.toFixed(0)}/100 (${level.toLowerCase()}). ` +
        `The largest contributors are ${leading
          .slice(0, 2)
          .map((factor) => `${factor.label.toLowerCase()} (${factor.points.toFixed(0)} pts)`)
          .join(" and ")}.`;

  const recommendations: string[] = [];
  if (attendancePoints >= 12) {
    recommendations.push("Call the guardian to establish the reason for absence.");
  }
  if (academicPoints >= 10) {
    recommendations.push("Arrange remedial support in the weakest subjects.");
  }
  if (feePoints >= 8) {
    recommendations.push("Offer a fee instalment plan or review concession eligibility.");
  }
  if (homeworkPoints >= 6) {
    recommendations.push("Ask the class teacher to set up a homework check-in.");
  }
  if (recommendations.length === 0) {
    recommendations.push("No intervention needed — continue routine monitoring.");
  }

  return {
    studentId: signals.studentId,
    score,
    level,
    factors,
    explanation,
    recommendations,
  };
}

/**
 * Gathers signals for every active student in a school and scores them.
 * Queries are aggregate-per-model rather than per-student, so cost stays flat
 * as the roll grows.
 */
export async function assessSchool(
  schoolId: string,
  academicYearId: string,
): Promise<RiskAssessment[]> {
  const students = await prisma.student.findMany({
    where: { schoolId, status: "ACTIVE", deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (students.length === 0) return [];

  const studentIds = students.map((student) => student.id);

  const [attendance, absenceDates, marks, invoices, submissions, overdueBooks] =
    await Promise.all([
      prisma.attendanceRecord.groupBy({
        by: ["studentId", "status"],
        where: { schoolId, academicYearId, studentId: { in: studentIds } },
        _count: { _all: true },
      }),
      prisma.attendanceRecord.findMany({
        where: {
          schoolId,
          academicYearId,
          status: "ABSENT",
          studentId: { in: studentIds },
        },
        select: { studentId: true, date: true },
        orderBy: { date: "asc" },
      }),
      prisma.markEntry.findMany({
        where: { schoolId, studentId: { in: studentIds } },
        select: {
          studentId: true,
          marksObtained: true,
          createdAt: true,
          exam: { select: { maxMarks: true, term: { select: { sequence: true } } } },
        },
      }),
      prisma.invoice.groupBy({
        by: ["studentId"],
        where: { schoolId, academicYearId, studentId: { in: studentIds } },
        _sum: { amountDue: true, total: true },
        _min: { dueDate: true },
      }),
      prisma.homeworkSubmission.groupBy({
        by: ["studentId", "status"],
        where: { studentId: { in: studentIds } },
        _count: { _all: true },
      }),
      prisma.bookIssue.groupBy({
        by: ["studentId"],
        where: {
          schoolId,
          returnedOn: null,
          dueOn: { lt: new Date() },
          studentId: { in: studentIds },
        },
        _count: { _all: true },
      }),
    ]);

  // -- Reshape into per-student lookups -------------------------------------
  const attendanceByStudent = new Map<string, { total: number; present: number }>();
  for (const row of attendance) {
    const entry = attendanceByStudent.get(row.studentId) ?? { total: 0, present: 0 };
    entry.total += row._count._all;
    if (row.status === "PRESENT" || row.status === "LATE") {
      entry.present += row._count._all;
    }
    attendanceByStudent.set(row.studentId, entry);
  }

  const runByStudent = new Map<string, number>();
  const lastDateByStudent = new Map<string, number>();
  const currentRunByStudent = new Map<string, number>();
  for (const row of absenceDates) {
    const time = row.date.getTime();
    const previous = lastDateByStudent.get(row.studentId);
    // Consecutive school days: allow up to a 3-day gap so a weekend between
    // two absences still counts as an unbroken run.
    const consecutive = previous !== undefined && time - previous <= 3 * 86400000;
    const run = consecutive ? (currentRunByStudent.get(row.studentId) ?? 1) + 1 : 1;
    currentRunByStudent.set(row.studentId, run);
    lastDateByStudent.set(row.studentId, time);
    runByStudent.set(row.studentId, Math.max(runByStudent.get(row.studentId) ?? 0, run));
  }

  type MarkBucket = { all: number[]; byTerm: Map<number, number[]> };
  const marksByStudent = new Map<string, MarkBucket>();
  for (const row of marks) {
    const max = toNumber(row.exam.maxMarks);
    if (max <= 0) continue;
    const percent = (toNumber(row.marksObtained) / max) * 100;
    const entry: MarkBucket =
      marksByStudent.get(row.studentId) ?? { all: [], byTerm: new Map() };
    entry.all.push(percent);
    const term = row.exam.term.sequence;
    entry.byTerm.set(term, [...(entry.byTerm.get(term) ?? []), percent]);
    marksByStudent.set(row.studentId, entry);
  }

  const invoiceByStudent = new Map(invoices.map((row) => [row.studentId, row]));

  const homeworkByStudent = new Map<string, { assigned: number; missed: number }>();
  for (const row of submissions) {
    if (!row.studentId) continue;
    const entry = homeworkByStudent.get(row.studentId) ?? { assigned: 0, missed: 0 };
    entry.assigned += row._count._all;
    if (row.status === "ASSIGNED" || row.status === "MISSING") {
      entry.missed += row._count._all;
    }
    homeworkByStudent.set(row.studentId, entry);
  }

  const overdueByStudent = new Map(
    overdueBooks
      .filter((row): row is typeof row & { studentId: string } => row.studentId !== null)
      .map((row) => [row.studentId, row._count._all]),
  );

  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  return students.map((student) => {
    const attendanceEntry = attendanceByStudent.get(student.id) ?? { total: 0, present: 0 };
    const markEntry = marksByStudent.get(student.id);
    const invoiceEntry = invoiceByStudent.get(student.id);
    const homeworkEntry = homeworkByStudent.get(student.id) ?? { assigned: 0, missed: 0 };

    // Term-over-term delta, using the two most recent terms that have marks.
    let percentDelta: number | null = null;
    if (markEntry && markEntry.byTerm.size >= 2) {
      const terms = [...markEntry.byTerm.keys()].sort((a, b) => b - a);
      const latest = average(markEntry.byTerm.get(terms[0]) ?? []);
      const previous = average(markEntry.byTerm.get(terms[1]) ?? []);
      if (latest !== null && previous !== null) percentDelta = latest - previous;
    }

    const outstanding = toNumber(invoiceEntry?._sum.amountDue);
    const oldestDue = invoiceEntry?._min.dueDate;
    const daysOverdue =
      outstanding > 0 && oldestDue && oldestDue < new Date()
        ? Math.floor((Date.now() - oldestDue.getTime()) / 86400000)
        : 0;

    return assessRisk({
      studentId: student.id,
      name: `${student.firstName} ${student.lastName ?? ""}`.trim(),
      attendanceTotal: attendanceEntry.total,
      attendancePresent: attendanceEntry.present,
      longestAbsenceRun: runByStudent.get(student.id) ?? 0,
      averagePercent: markEntry ? average(markEntry.all) : null,
      percentDelta,
      feeOutstanding: outstanding,
      feeBilled: toNumber(invoiceEntry?._sum.total),
      daysOverdue,
      homeworkAssigned: homeworkEntry.assigned,
      homeworkMissed: homeworkEntry.missed,
      libraryOverdue: overdueByStudent.get(student.id) ?? 0,
    });
  });
}

/** Recomputes and persists risk scores for a school. Safe to run on a schedule. */
export async function refreshRiskScores(
  schoolId: string,
  academicYearId: string,
): Promise<{ assessed: number; elevated: number }> {
  const assessments = await assessSchool(schoolId, academicYearId);

  for (const assessment of assessments) {
    await prisma.riskScore.upsert({
      where: {
        studentId_academicYearId_kind: {
          studentId: assessment.studentId,
          academicYearId,
          kind: "DROPOUT",
        },
      },
      create: {
        schoolId,
        studentId: assessment.studentId,
        academicYearId,
        kind: "DROPOUT",
        score: assessment.score,
        level: assessment.level,
        factors: assessment.factors as never,
        explanation: assessment.explanation,
      },
      update: {
        score: assessment.score,
        level: assessment.level,
        factors: assessment.factors as never,
        explanation: assessment.explanation,
        computedAt: new Date(),
      },
    });
  }

  return {
    assessed: assessments.length,
    elevated: assessments.filter(
      (assessment) => assessment.level === "HIGH" || assessment.level === "CRITICAL",
    ).length,
  };
}
