/**
 * Curriculum rules — the configuration everything else depends on.
 *
 * A class's subject allocation feeds the timetable generator, and its marks
 * configuration feeds report cards. Both fail confusingly when this layer is
 * wrong, so the constraints are checked here where they can be explained,
 * rather than surfacing later as "3 periods could not be placed".
 */

export interface CurriculumEntry {
  subjectId: string;
  subjectName: string;
  weeklyPeriods: number;
  teacherId: string | null;
}

export type LoadState = "UNDER" | "EXACT" | "OVER" | "EMPTY";

export interface CurriculumLoad {
  allocated: number;
  capacity: number;
  free: number;
  state: LoadState;
  /** Subjects with no teacher assigned; the timetable leaves these unstaffed. */
  unstaffed: string[];
}

/**
 * Whether a class's weekly subject allocation fits the timetable.
 *
 * The timetable generator can only place as many periods as the week has
 * teaching slots. Demand beyond that is reported here as an over-allocation
 * rather than discovered later as an unexplained shortfall.
 */
export function curriculumLoad(
  entries: readonly CurriculumEntry[],
  teachingPeriodsPerDay: number,
  workingDays: number,
): CurriculumLoad {
  const capacity = Math.max(0, teachingPeriodsPerDay * workingDays);
  const allocated = entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.weeklyPeriods),
    0,
  );

  const state: LoadState =
    allocated === 0 ? "EMPTY"
    : allocated > capacity ? "OVER"
    : allocated === capacity ? "EXACT"
    : "UNDER";

  return {
    allocated,
    capacity,
    free: Math.max(0, capacity - allocated),
    state,
    unstaffed: entries
      .filter((entry) => entry.teacherId === null)
      .map((entry) => entry.subjectName),
  };
}

export interface TeacherCommitment {
  teacherId: string;
  teacherName: string;
  periods: number;
  /** How many separate class-subject pairings this teacher covers. */
  assignments: number;
  state: "LIGHT" | "HEALTHY" | "HEAVY" | "OVERCOMMITTED";
}

/**
 * Weekly load per teacher across every class they teach.
 *
 * A teacher assigned more periods than the week contains cannot be timetabled
 * at all — the generator will silently drop lessons, so it is worth naming
 * here. Sections of the same class level share an assignment, so the load is
 * counted per section, which is how it is actually taught.
 */
export function teacherCommitments(
  entries: readonly (CurriculumEntry & { sections: number; teacherName?: string })[],
  weeklyCapacity: number,
): TeacherCommitment[] {
  const byTeacher = new Map<string, { name: string; periods: number; count: number }>();

  for (const entry of entries) {
    if (!entry.teacherId) continue;
    const current = byTeacher.get(entry.teacherId) ?? {
      name: entry.teacherName ?? "Unknown",
      periods: 0,
      count: 0,
    };
    current.periods += entry.weeklyPeriods * Math.max(1, entry.sections);
    current.count += 1;
    byTeacher.set(entry.teacherId, current);
  }

  return [...byTeacher.entries()]
    .map(([teacherId, value]) => {
      const ratio = weeklyCapacity > 0 ? value.periods / weeklyCapacity : 0;
      return {
        teacherId,
        teacherName: value.name,
        periods: value.periods,
        assignments: value.count,
        state:
          value.periods > weeklyCapacity ? ("OVERCOMMITTED" as const)
          : ratio >= 0.85 ? ("HEAVY" as const)
          : ratio >= 0.4 ? ("HEALTHY" as const)
          : ("LIGHT" as const),
      };
    })
    .sort((a, b) => b.periods - a.periods);
}

export interface MarksValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Marks configuration for a subject.
 *
 * A pass mark above the maximum would fail every student who ever sat the
 * paper, and a zero maximum makes the report card divide by zero — both are
 * cheap to prevent here and expensive to discover at results time.
 */
export function validateMarks(
  maxMarks: number,
  passMarks: number,
): MarksValidation {
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
    return { ok: false, reason: "Maximum marks must be greater than zero." };
  }
  if (!Number.isFinite(passMarks) || passMarks < 0) {
    return { ok: false, reason: "Pass marks cannot be negative." };
  }
  if (passMarks > maxMarks) {
    return {
      ok: false,
      reason: `Pass marks (${passMarks}) cannot exceed the maximum (${maxMarks}).`,
    };
  }
  if (passMarks === maxMarks) {
    return {
      ok: false,
      reason: "Pass marks equal to the maximum would require a perfect score to pass.",
    };
  }
  return { ok: true };
}

/** A subject code, normalised: upper case, alphanumeric, 2–8 characters. */
export function normaliseSubjectCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function validateSubjectCode(code: string): MarksValidation {
  const normalised = normaliseSubjectCode(code);
  if (normalised.length < 2) {
    return { ok: false, reason: "A subject code needs at least two characters." };
  }
  return { ok: true };
}
