/**
 * Unit checks for the grading rules in src/lib/grading-core.ts.
 *
 *   npx tsx scripts/verify-grading.ts
 *
 * These rules decide real students' grades, so the edge cases — band
 * boundaries, absences, weighted papers, tied ranks — are pinned down here.
 * Exits non-zero on the first failure so it can gate CI.
 */

import {
  assignRanks,
  computeTotals,
  resolveGrade,
  summariseSubject,
  type GradeBandLike,
  type SubjectMark,
  type SubjectSummary,
} from "../src/lib/grading-core";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

function equal(label: string, actual: unknown, expected: unknown) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  check(label, passed, passed ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// The CBSE scheme the seed installs.
const BANDS: GradeBandLike[] = [
  { grade: "A1", minPercent: 91, maxPercent: 100, gradePoint: 10 },
  { grade: "A2", minPercent: 81, maxPercent: 90.99, gradePoint: 9 },
  { grade: "B1", minPercent: 71, maxPercent: 80.99, gradePoint: 8 },
  { grade: "B2", minPercent: 61, maxPercent: 70.99, gradePoint: 7 },
  { grade: "C1", minPercent: 51, maxPercent: 60.99, gradePoint: 6 },
  { grade: "C2", minPercent: 41, maxPercent: 50.99, gradePoint: 5 },
  { grade: "D", minPercent: 33, maxPercent: 40.99, gradePoint: 4 },
  { grade: "E", minPercent: 0, maxPercent: 32.99, gradePoint: 0 },
];

function subject(over: Partial<SubjectMark> = {}): SubjectMark {
  return {
    subjectId: "s1",
    subjectName: "Mathematics",
    isGraded: true,
    maxMarks: 100,
    obtainedMarks: 50,
    isAbsent: false,
    weightage: 100,
    ...over,
  };
}

function summary(over: Partial<SubjectSummary> = {}): SubjectSummary {
  return {
    subjectId: "s1",
    subjectName: "Mathematics",
    isGraded: true,
    maxMarks: 100,
    obtainedMarks: 50,
    percentage: 50,
    wasAbsent: false,
    ...over,
  };
}

console.log("\n— resolveGrade —");
equal("exact band minimum takes that band", resolveGrade(91, BANDS)?.grade, "A1");
equal("exact band maximum takes that band", resolveGrade(90.99, BANDS)?.grade, "A2");
equal("mid-band resolves correctly", resolveGrade(75, BANDS)?.grade, "B1");
equal("zero resolves to the lowest band", resolveGrade(0, BANDS)?.grade, "E");
equal("a perfect 100 resolves to the top band", resolveGrade(100, BANDS)?.grade, "A1");
check(
  "a value above every maximum still grades, rather than returning null",
  resolveGrade(105, BANDS)?.grade === "A1",
  "bonus marks must not produce an ungraded card",
);
check("a value inside a gap falls to the band below", resolveGrade(90.995, BANDS)?.grade === "A2");
equal("grade point comes through", resolveGrade(95, BANDS)?.gradePoint, 10);
check("an empty scheme returns null", resolveGrade(50, []) === null);

console.log("\n— summariseSubject —");
equal(
  "a single paper reports its own percentage",
  summariseSubject([subject({ obtainedMarks: 68 })])?.percentage,
  68,
);
equal(
  "two equally weighted papers average",
  summariseSubject([
    subject({ obtainedMarks: 60 }),
    subject({ obtainedMarks: 80 }),
  ])?.percentage,
  70,
);
equal(
  "weightage is applied proportionally, not by raw marks",
  // 40 out of 50 (80%) at weight 30, plus 50 out of 100 (50%) at weight 70
  // → 0.8*30 + 0.5*70 = 59 over a total weight of 100.
  summariseSubject([
    subject({ maxMarks: 50, obtainedMarks: 40, weightage: 30 }),
    subject({ maxMarks: 100, obtainedMarks: 50, weightage: 70 }),
  ])?.percentage,
  59,
);
{
  const absentAll = summariseSubject([
    subject({ obtainedMarks: null, isAbsent: true }),
  ]);
  check("absent from every paper reports absent, not zero", absentAll?.wasAbsent === true);
  check("an absent subject has no percentage", absentAll?.percentage === null);
}
{
  const partial = summariseSubject([
    subject({ obtainedMarks: 80 }),
    subject({ obtainedMarks: null, isAbsent: true }),
  ]);
  check(
    "absence from one paper does not drag the average to zero",
    partial?.percentage === 80 && partial.wasAbsent === false,
    "only attempted papers are averaged",
  );
}
check("no marks at all returns null", summariseSubject([]) === null);

console.log("\n— computeTotals —");
{
  const totals = computeTotals(
    [summary({ obtainedMarks: 80, percentage: 80 }), summary({ subjectId: "s2", obtainedMarks: 60, percentage: 60 })],
    BANDS,
  );
  equal("total marks sum across subjects", totals.totalMarks, 200);
  equal("obtained marks sum across subjects", totals.obtainedMarks, 140);
  equal("percentage is computed from the totals", totals.percentage, 70);
  equal("passing every subject yields PASS", totals.result, "PASS");
  // 80% falls in B1 (8 points), 60% in C1 (6 points) → 7.0.
  // Note this is the mean of the *band* points, not of the raw percentages.
  equal("GPA averages the per-subject grade points", totals.gpa, 7);
}
{
  const totals = computeTotals(
    [summary({ percentage: 90, obtainedMarks: 90 }), summary({ subjectId: "s2", percentage: 20, obtainedMarks: 20 })],
    BANDS,
  );
  equal(
    "one subject below the pass mark fails the student despite a high average",
    totals.result,
    "FAIL",
  );
}
{
  const totals = computeTotals(
    [
      summary({ percentage: 80, obtainedMarks: 80 }),
      summary({ subjectId: "s2", isGraded: false, percentage: 10, obtainedMarks: 10 }),
    ],
    BANDS,
  );
  equal(
    "co-scholastic subjects are excluded from the percentage",
    totals.percentage,
    80,
  );
  equal("a weak co-scholastic grade does not fail the student", totals.result, "PASS");
}
{
  const totals = computeTotals(
    [summary({ wasAbsent: true, obtainedMarks: null, percentage: null })],
    BANDS,
  );
  equal("absent from everything reports ABSENT", totals.result, "ABSENT");
}

console.log("\n— assignRanks —");
{
  const rows = [
    { id: "a", percentage: 88 },
    { id: "b", percentage: 92 },
    { id: "c", percentage: 75 },
  ];
  const ranks = assignRanks(rows);
  equal("highest percentage ranks first", ranks.get(rows[1]), 1);
  equal("second highest ranks second", ranks.get(rows[0]), 2);
  equal("lowest ranks last", ranks.get(rows[2]), 3);
}
{
  const rows = [
    { id: "a", percentage: 90 },
    { id: "b", percentage: 90 },
    { id: "c", percentage: 80 },
  ];
  const ranks = assignRanks(rows);
  check(
    "tied students share a rank",
    ranks.get(rows[0]) === 1 && ranks.get(rows[1]) === 1,
  );
  equal("the rank after a tie skips (competition ranking)", ranks.get(rows[2]), 3);
}

console.log(
  failures === 0
    ? "\nAll grading checks passed.\n"
    : `\n${failures} grading check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
