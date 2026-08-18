/**
 * Checks the timetable generator in src/lib/timetable.ts.
 *
 *   npx tsx scripts/verify-timetable.ts
 *
 * The generator's central promise is that it never double-books a teacher or a
 * section. These checks exercise that on a realistic school-sized grid and on
 * deliberately over-subscribed input, where the correct behaviour is to report
 * a shortfall rather than emit a clashing timetable.
 */

import {
  findConflicts,
  generateTimetable,
  teacherLoad,
  WEEK,
  type PeriodSlot,
  type PlacedSlot,
  type Requirement,
} from "../src/lib/timetable";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

/** Seven teaching periods plus two breaks — the shape the seed installs. */
const PERIODS: PeriodSlot[] = [
  { id: "p1", sequence: 1, isBreak: false },
  { id: "p2", sequence: 2, isBreak: false },
  { id: "br1", sequence: 3, isBreak: true },
  { id: "p3", sequence: 4, isBreak: false },
  { id: "p4", sequence: 5, isBreak: false },
  { id: "br2", sequence: 6, isBreak: true },
  { id: "p5", sequence: 7, isBreak: false },
  { id: "p6", sequence: 8, isBreak: false },
  { id: "p7", sequence: 9, isBreak: false },
];

const SUBJECTS = [
  { id: "ENG", periods: 6 },
  { id: "MAT", periods: 6 },
  { id: "SCI", periods: 6 },
  { id: "SST", periods: 4 },
  { id: "HIN", periods: 4 },
  { id: "CSC", periods: 3 },
  { id: "PED", periods: 2 },
  { id: "ART", periods: 2 },
];

/** 20 sections, one dedicated teacher per subject per section. */
function realisticRequirements(sectionCount: number): Requirement[] {
  const requirements: Requirement[] = [];
  for (let s = 0; s < sectionCount; s += 1) {
    for (const subject of SUBJECTS) {
      requirements.push({
        sectionId: `sec${s}`,
        subjectId: subject.id,
        // Each section has its own subject teacher, as a large school does.
        teacherId: `t${s}_${subject.id}`,
        periodsPerWeek: subject.periods,
      });
    }
  }
  return requirements;
}

console.log("\n— findConflicts —");
{
  const clean: PlacedSlot[] = [
    { sectionId: "a", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "ENG", teacherId: "t1" },
    { sectionId: "b", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "MAT", teacherId: "t2" },
  ];
  check("no conflict when teachers differ", findConflicts(clean).length === 0);

  const teacherClash: PlacedSlot[] = [
    { sectionId: "a", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "ENG", teacherId: "t1" },
    { sectionId: "b", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "MAT", teacherId: "t1" },
  ];
  const found = findConflicts(teacherClash);
  check(
    "one teacher in two sections at once is a conflict",
    found.length === 1 && found[0].kind === "TEACHER_DOUBLE_BOOKED",
    found[0]?.kind,
  );

  const sectionClash: PlacedSlot[] = [
    { sectionId: "a", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "ENG", teacherId: "t1" },
    { sectionId: "a", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "MAT", teacherId: "t2" },
  ];
  check(
    "one section with two lessons at once is a conflict",
    findConflicts(sectionClash).some((c) => c.kind === "SECTION_DOUBLE_BOOKED"),
  );

  const differentDay: PlacedSlot[] = [
    { sectionId: "a", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "ENG", teacherId: "t1" },
    { sectionId: "b", dayOfWeek: "TUESDAY", periodId: "p1", subjectId: "MAT", teacherId: "t1" },
  ];
  check("the same teacher on different days is fine", findConflicts(differentDay).length === 0);

  const unstaffed: PlacedSlot[] = [
    { sectionId: "a", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "ENG", teacherId: null },
    { sectionId: "b", dayOfWeek: "MONDAY", periodId: "p1", subjectId: "MAT", teacherId: null },
  ];
  check(
    "unstaffed lessons are not treated as a teacher clash",
    findConflicts(unstaffed).length === 0,
    "null teacher is a shortfall, not a double-booking",
  );
}

console.log("\n— generateTimetable, realistic load —");
{
  const requirements = realisticRequirements(20);
  const started = Date.now();
  const report = generateTimetable(requirements, PERIODS, { seed: 42 });
  const elapsed = Date.now() - started;

  check(
    "produces a completely clash-free grid",
    report.conflicts.length === 0,
    `${report.conflicts.length} conflicts across ${report.placed} slots`,
  );
  check(
    "places every requested period",
    report.placed === report.requested && report.shortfalls.length === 0,
    `${report.placed}/${report.requested}`,
  );
  check(
    "never schedules into a break period",
    report.slots.every((slot) => !slot.periodId.startsWith("br")),
  );
  check(
    "uses only the configured weekdays",
    report.slots.every((slot) => WEEK.includes(slot.dayOfWeek)),
  );
  check("finishes quickly enough to run on request", elapsed < 5000, `${elapsed}ms`);

  // Spread: a section should not get the same subject more than twice a day.
  const perDay = new Map<string, number>();
  for (const slot of report.slots) {
    const key = `${slot.sectionId}|${slot.subjectId}|${slot.dayOfWeek}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  check(
    "no subject runs more than twice a day for a section",
    [...perDay.values()].every((count) => count <= 2),
    `max ${Math.max(...perDay.values())} in a day`,
  );
}

console.log("\n— shared teachers across sections —");
{
  // One teacher per subject for the whole school: heavy contention, since that
  // teacher must cover every section without ever clashing.
  const requirements: Requirement[] = [];
  for (let s = 0; s < 5; s += 1) {
    for (const subject of SUBJECTS.slice(0, 5)) {
      requirements.push({
        sectionId: `sec${s}`,
        subjectId: subject.id,
        teacherId: `shared_${subject.id}`,
        periodsPerWeek: subject.periods,
      });
    }
  }
  const report = generateTimetable(requirements, PERIODS, { seed: 7 });

  check(
    "shared teachers are never double-booked",
    report.conflicts.length === 0,
    `${report.placed}/${report.requested} placed`,
  );

  const load = teacherLoad(report.slots);
  check(
    "a shared teacher's load is the sum of their sections",
    load.get("shared_ENG") === 6 * 5 - (report.shortfalls
      .filter((s) => s.subjectId === "ENG")
      .reduce((sum, s) => sum + s.missing, 0)),
    `${load.get("shared_ENG")} periods`,
  );
}

console.log("\n— over-subscribed input —");
{
  // Demand far exceeding the 42 teaching cells in a week for one section.
  const requirements: Requirement[] = [
    { sectionId: "sec0", subjectId: "ENG", teacherId: "t1", periodsPerWeek: 60 },
  ];
  const report = generateTimetable(requirements, PERIODS, { seed: 3, attempts: 2 });

  check(
    "impossible demand still yields a clash-free grid",
    report.conflicts.length === 0,
  );
  check(
    "the shortfall is reported rather than silently dropped",
    report.shortfalls.length === 1 && report.shortfalls[0].missing === 60 - report.placed,
    `placed ${report.placed}, missing ${report.shortfalls[0]?.missing}`,
  );
  check(
    "placement is capped by the available teaching cells",
    report.placed === 6 * 7,
    `${report.placed} = 6 days × 7 teaching periods`,
  );
}

console.log("\n— determinism —");
{
  const requirements = realisticRequirements(6);
  const a = generateTimetable(requirements, PERIODS, { seed: 99 });
  const b = generateTimetable(requirements, PERIODS, { seed: 99 });
  const serialise = (slots: PlacedSlot[]) =>
    JSON.stringify(
      [...slots].sort((x, y) =>
        `${x.sectionId}${x.dayOfWeek}${x.periodId}`.localeCompare(
          `${y.sectionId}${y.dayOfWeek}${y.periodId}`,
        ),
      ),
    );
  check(
    "the same seed reproduces the same timetable",
    serialise(a.slots) === serialise(b.slots),
  );

  const c = generateTimetable(requirements, PERIODS, { seed: 100 });
  check(
    "a different seed explores a different arrangement",
    serialise(a.slots) !== serialise(c.slots),
  );
}

console.log(
  failures === 0
    ? "\nAll timetable checks passed.\n"
    : `\n${failures} timetable check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
