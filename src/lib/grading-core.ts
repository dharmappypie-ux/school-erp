import { toNumber } from "@/lib/format";

/**
 * Pure grading rules — no database, no server-only import, so this module can
 * be unit-tested directly. Everything that touches Prisma lives in
 * `src/lib/grading.ts`, which re-exports these.
 */

export interface GradeBandLike {
  grade: string;
  minPercent: number | string | { toString(): string };
  maxPercent: number | string | { toString(): string };
  gradePoint?: number | string | { toString(): string } | null;
  remark?: string | null;
}

export interface ResolvedGrade {
  grade: string;
  gradePoint: number | null;
  remark: string | null;
}

/**
 * Finds the band a percentage falls into.
 *
 * Bands are checked from the highest minimum downwards, so overlapping or
 * gapped band definitions still resolve to the best matching grade instead of
 * returning nothing. A percentage above every band's maximum takes the top
 * band — a school that caps its scheme at 100 should still grade a 100.
 */
export function resolveGrade(
  percent: number,
  bands: readonly GradeBandLike[],
): ResolvedGrade | null {
  if (bands.length === 0) return null;

  const ordered = [...bands].sort(
    (a, b) => toNumber(b.minPercent) - toNumber(a.minPercent),
  );

  const match =
    ordered.find(
      (band) =>
        percent >= toNumber(band.minPercent) && percent <= toNumber(band.maxPercent),
    ) ??
    ordered.find((band) => percent >= toNumber(band.minPercent)) ??
    null;

  if (!match) return null;
  return {
    grade: match.grade,
    gradePoint:
      match.gradePoint === null || match.gradePoint === undefined
        ? null
        : toNumber(match.gradePoint),
    remark: match.remark ?? null,
  };
}

export interface SubjectMark {
  subjectId: string;
  subjectName: string;
  isGraded: boolean;
  maxMarks: number;
  obtainedMarks: number | null;
  isAbsent: boolean;
  /** Relative contribution of this exam within the subject, as a percentage. */
  weightage: number;
}

export interface SubjectSummary {
  subjectId: string;
  subjectName: string;
  isGraded: boolean;
  maxMarks: number;
  obtainedMarks: number | null;
  percentage: number | null;
  wasAbsent: boolean;
}

/**
 * Rolls several exams in one subject into a single line.
 *
 * Weightage is applied proportionally: two exams weighted 30 and 70 produce a
 * mark out of 100 regardless of each paper's own maximum. A subject where the
 * student was absent from every paper reports as absent rather than zero —
 * those are different facts, and averaging a zero would silently punish a
 * child who had a medical absence.
 */
export function summariseSubject(
  marks: readonly SubjectMark[],
): SubjectSummary | null {
  if (marks.length === 0) return null;
  const first = marks[0];

  const attempted = marks.filter(
    (mark) => !mark.isAbsent && mark.obtainedMarks !== null,
  );
  if (attempted.length === 0) {
    return {
      subjectId: first.subjectId,
      subjectName: first.subjectName,
      isGraded: first.isGraded,
      maxMarks: marks.reduce((sum, mark) => sum + mark.maxMarks, 0),
      obtainedMarks: null,
      percentage: null,
      wasAbsent: true,
    };
  }

  const totalWeight = attempted.reduce(
    (sum, mark) => sum + (mark.weightage || 100),
    0,
  );
  const weightedPercent = attempted.reduce((sum, mark) => {
    const share =
      mark.maxMarks > 0 ? (mark.obtainedMarks as number) / mark.maxMarks : 0;
    return sum + share * (mark.weightage || 100);
  }, 0);

  const percentage = totalWeight > 0 ? (weightedPercent / totalWeight) * 100 : 0;

  // Report the raw totals too — parents expect "68 / 100", not just a percentage.
  const maxMarks = attempted.reduce((sum, mark) => sum + mark.maxMarks, 0);
  const obtainedMarks = attempted.reduce(
    (sum, mark) => sum + (mark.obtainedMarks as number),
    0,
  );

  return {
    subjectId: first.subjectId,
    subjectName: first.subjectName,
    isGraded: first.isGraded,
    maxMarks,
    obtainedMarks,
    percentage: Math.round(percentage * 100) / 100,
    wasAbsent: false,
  };
}

export interface CardTotals {
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  gpa: number | null;
  result: "PASS" | "FAIL" | "ABSENT";
}

/**
 * Overall totals across a student's subjects.
 *
 * Only subjects flagged `isGraded` count toward the percentage — co-scholastic
 * areas such as Art and PE are reported separately and must not dilute the
 * academic result.
 */
export function computeTotals(
  subjects: readonly SubjectSummary[],
  bands: readonly GradeBandLike[],
  passPercent = 33,
): CardTotals {
  const graded = subjects.filter((subject) => subject.isGraded);
  const present = graded.filter((subject) => !subject.wasAbsent);

  if (present.length === 0) {
    return {
      totalMarks: 0,
      obtainedMarks: 0,
      percentage: 0,
      gpa: null,
      result: "ABSENT",
    };
  }

  const totalMarks = present.reduce((sum, subject) => sum + subject.maxMarks, 0);
  const obtainedMarks = present.reduce(
    (sum, subject) => sum + (subject.obtainedMarks ?? 0),
    0,
  );
  const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;

  const points = present
    .map((subject) => resolveGrade(subject.percentage ?? 0, bands)?.gradePoint)
    .filter((point): point is number => point !== null && point !== undefined);
  const gpa =
    points.length > 0
      ? Math.round(
          (points.reduce((sum, point) => sum + point, 0) / points.length) * 100,
        ) / 100
      : null;

  // A single subject below the pass mark fails the student, which is how most
  // Indian boards work — an overall average above the line is not enough.
  const failedAny = present.some(
    (subject) => (subject.percentage ?? 0) < passPercent,
  );
  const absentAny = graded.some((subject) => subject.wasAbsent);

  return {
    totalMarks,
    obtainedMarks,
    percentage: Math.round(percentage * 100) / 100,
    gpa,
    result: failedAny || absentAny ? "FAIL" : "PASS",
  };
}

/**
 * Competition ranking (1, 2, 2, 4) over percentages, highest first.
 * Ties genuinely share a rank; the next rank skips accordingly.
 */
export function assignRanks<T extends { percentage: number }>(
  rows: readonly T[],
): Map<T, number> {
  const ordered = [...rows].sort((a, b) => b.percentage - a.percentage);
  const ranks = new Map<T, number>();

  let lastPercentage: number | null = null;
  let lastRank = 0;
  ordered.forEach((row, index) => {
    if (lastPercentage !== null && row.percentage === lastPercentage) {
      ranks.set(row, lastRank);
    } else {
      lastRank = index + 1;
      lastPercentage = row.percentage;
      ranks.set(row, lastRank);
    }
  });

  return ranks;
}
