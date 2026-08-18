/**
 * Timetable construction and validation.
 *
 * Pure — no database access, so the generator can be unit-tested and the UI can
 * share the same conflict rules the server enforces.
 *
 * The scheduling problem here is a constrained assignment: every section needs
 * a fixed number of periods per subject each week, and a teacher can only be
 * in one room at a time. It is solved greedily, most-constrained-first, with
 * randomised restarts — exact optimisation is unnecessary for a school-sized
 * grid and would be far slower.
 */

export type Weekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export const WEEK: Weekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export interface PeriodSlot {
  id: string;
  sequence: number;
  isBreak: boolean;
}

/** One subject's weekly demand for one section. */
export interface Requirement {
  sectionId: string;
  subjectId: string;
  teacherId: string | null;
  periodsPerWeek: number;
}

export interface PlacedSlot {
  sectionId: string;
  dayOfWeek: Weekday;
  periodId: string;
  subjectId: string;
  teacherId: string | null;
}

export type ConflictKind = "TEACHER_DOUBLE_BOOKED" | "SECTION_DOUBLE_BOOKED";

export interface Conflict {
  kind: ConflictKind;
  dayOfWeek: Weekday;
  periodId: string;
  /** Teacher id or section id, depending on `kind`. */
  subjectOfClash: string;
  slots: PlacedSlot[];
}

/**
 * Finds every clash in a set of slots.
 *
 * Two rules, both hard: a teacher cannot appear twice in the same period on the
 * same day, and neither can a section. Free periods (`teacherId: null`) are
 * ignored for the teacher rule — an unstaffed lesson is a shortfall, not a
 * clash.
 */
export function findConflicts(slots: readonly PlacedSlot[]): Conflict[] {
  const byTeacher = new Map<string, PlacedSlot[]>();
  const bySection = new Map<string, PlacedSlot[]>();

  for (const slot of slots) {
    const cell = `${slot.dayOfWeek}|${slot.periodId}`;
    if (slot.teacherId) {
      const key = `${slot.teacherId}|${cell}`;
      byTeacher.set(key, [...(byTeacher.get(key) ?? []), slot]);
    }
    const sectionKey = `${slot.sectionId}|${cell}`;
    bySection.set(sectionKey, [...(bySection.get(sectionKey) ?? []), slot]);
  }

  const conflicts: Conflict[] = [];

  for (const [key, group] of byTeacher) {
    if (group.length < 2) continue;
    const [teacherId, dayOfWeek, periodId] = key.split("|");
    conflicts.push({
      kind: "TEACHER_DOUBLE_BOOKED",
      dayOfWeek: dayOfWeek as Weekday,
      periodId,
      subjectOfClash: teacherId,
      slots: group,
    });
  }

  for (const [key, group] of bySection) {
    if (group.length < 2) continue;
    const [sectionId, dayOfWeek, periodId] = key.split("|");
    conflicts.push({
      kind: "SECTION_DOUBLE_BOOKED",
      dayOfWeek: dayOfWeek as Weekday,
      periodId,
      subjectOfClash: sectionId,
      slots: group,
    });
  }

  return conflicts;
}

export interface GenerationOptions {
  days?: Weekday[];
  /** Cap on how many times one subject may run for a section in a single day. */
  maxPerSubjectPerDay?: number;
  /** Restarts with a different shuffle when lessons cannot all be placed. */
  attempts?: number;
  /** Fixes the shuffle so the same input always yields the same timetable. */
  seed?: number;
}

export interface GenerationReport {
  slots: PlacedSlot[];
  placed: number;
  requested: number;
  /** Lessons that could not be placed, with how many are missing. */
  shortfalls: { sectionId: string; subjectId: string; missing: number }[];
  conflicts: Conflict[];
  attemptsUsed: number;
}

/** Small deterministic PRNG so a generated timetable is reproducible. */
function makeRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Builds a clash-free timetable.
 *
 * Guarantees the produced slots contain **no** teacher or section conflict.
 * When demand cannot fit the available cells, it reports the shortfall rather
 * than emitting an invalid grid — a timetable that quietly double-books is far
 * worse than one that is honestly incomplete.
 */
export function generateTimetable(
  requirements: readonly Requirement[],
  periods: readonly PeriodSlot[],
  options: GenerationOptions = {},
): GenerationReport {
  const days = options.days ?? WEEK.slice(0, 6);
  const maxPerDay = options.maxPerSubjectPerDay ?? 2;
  const attempts = Math.max(1, options.attempts ?? 6);
  const teaching = periods.filter((period) => !period.isBreak);

  const requested = requirements.reduce(
    (sum, requirement) => sum + requirement.periodsPerWeek,
    0,
  );

  let best: GenerationReport | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const random = makeRandom((options.seed ?? 20260401) + attempt * 7919);

    // Expand each requirement into individual lessons.
    const lessons: Requirement[] = [];
    for (const requirement of requirements) {
      for (let i = 0; i < requirement.periodsPerWeek; i += 1) {
        lessons.push(requirement);
      }
    }

    // Most-constrained-first: teachers carrying the heaviest load have the
    // fewest free cells left by the end, so they are placed while choice
    // remains. Ties are shuffled to give restarts a different search path.
    const loadByTeacher = new Map<string, number>();
    for (const lesson of lessons) {
      if (!lesson.teacherId) continue;
      loadByTeacher.set(
        lesson.teacherId,
        (loadByTeacher.get(lesson.teacherId) ?? 0) + 1,
      );
    }
    const ordered = shuffle(lessons, random).sort(
      (a, b) =>
        (loadByTeacher.get(b.teacherId ?? "") ?? 0) -
        (loadByTeacher.get(a.teacherId ?? "") ?? 0),
    );

    const takenBySection = new Set<string>();
    const takenByTeacher = new Set<string>();
    const perSectionSubjectDay = new Map<string, number>();
    const placedSlots: PlacedSlot[] = [];
    const missing = new Map<string, number>();

    for (const lesson of ordered) {
      // Candidate cells, shuffled so lessons spread across the week instead of
      // stacking into Monday's first periods.
      const cells: { day: Weekday; period: PeriodSlot }[] = [];
      for (const day of days) {
        for (const period of teaching) cells.push({ day, period });
      }

      let placedHere = false;

      // Two passes: first respecting the per-day cap, then relaxing it, so a
      // tight schedule degrades into a lumpier timetable rather than a gap.
      for (const enforceSpread of [true, false]) {
        for (const cell of shuffle(cells, random)) {
          const cellKey = `${cell.day}|${cell.period.id}`;
          const sectionKey = `${lesson.sectionId}|${cellKey}`;
          if (takenBySection.has(sectionKey)) continue;

          if (lesson.teacherId) {
            const teacherKey = `${lesson.teacherId}|${cellKey}`;
            if (takenByTeacher.has(teacherKey)) continue;
          }

          const spreadKey = `${lesson.sectionId}|${lesson.subjectId}|${cell.day}`;
          if (
            enforceSpread &&
            (perSectionSubjectDay.get(spreadKey) ?? 0) >= maxPerDay
          ) {
            continue;
          }

          takenBySection.add(sectionKey);
          if (lesson.teacherId) {
            takenByTeacher.add(`${lesson.teacherId}|${cellKey}`);
          }
          perSectionSubjectDay.set(
            spreadKey,
            (perSectionSubjectDay.get(spreadKey) ?? 0) + 1,
          );

          placedSlots.push({
            sectionId: lesson.sectionId,
            dayOfWeek: cell.day,
            periodId: cell.period.id,
            subjectId: lesson.subjectId,
            teacherId: lesson.teacherId,
          });
          placedHere = true;
          break;
        }
        if (placedHere) break;
      }

      if (!placedHere) {
        const key = `${lesson.sectionId}|${lesson.subjectId}`;
        missing.set(key, (missing.get(key) ?? 0) + 1);
      }
    }

    const report: GenerationReport = {
      slots: placedSlots,
      placed: placedSlots.length,
      requested,
      shortfalls: [...missing.entries()].map(([key, count]) => {
        const [sectionId, subjectId] = key.split("|");
        return { sectionId, subjectId, missing: count };
      }),
      conflicts: findConflicts(placedSlots),
      attemptsUsed: attempt,
    };

    if (!best || report.placed > best.placed) best = report;

    // A complete, clash-free grid is as good as it gets — stop early.
    if (report.shortfalls.length === 0 && report.conflicts.length === 0) {
      return report;
    }
  }

  return best!;
}

/**
 * Teachers free in a given cell — the candidate list when arranging cover for
 * an absent colleague.
 */
export function availableTeachers(
  allTeacherIds: readonly string[],
  slots: readonly PlacedSlot[],
  dayOfWeek: Weekday,
  periodId: string,
): string[] {
  const busy = new Set(
    slots
      .filter(
        (slot) => slot.dayOfWeek === dayOfWeek && slot.periodId === periodId,
      )
      .map((slot) => slot.teacherId)
      .filter((id): id is string => id !== null),
  );
  return allTeacherIds.filter((id) => !busy.has(id));
}

/** Weekly period count per teacher, for load reporting. */
export function teacherLoad(
  slots: readonly PlacedSlot[],
): Map<string, number> {
  const load = new Map<string, number>();
  for (const slot of slots) {
    if (!slot.teacherId) continue;
    load.set(slot.teacherId, (load.get(slot.teacherId) ?? 0) + 1);
  }
  return load;
}
