/**
 * Checks the analytics helpers in src/lib/analytics.ts.
 *
 *   npx tsx scripts/verify-analytics.ts
 *
 * Dashboards mislead in predictable ways, and these are the ways: a percentage
 * change from zero, a mean dragged by an outlier, a class of three ranked
 * against a class of forty, and buckets that quietly drop the rows they cannot
 * place. Each has a check here.
 */

import {
  agingBuckets,
  distribution,
  mean,
  median,
  rankGroups,
  slope,
  trend,
} from "../src/lib/analytics";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

console.log("\n— centre —");
{
  check("mean of an empty set is null, not zero", mean([]) === null, "zero would read as a real average");
  check("median of an empty set is null", median([]) === null);
  check("mean averages", mean([10, 20, 30]) === 20);
  check("median of an odd count is the middle", median([10, 20, 90]) === 20);
  check("median of an even count averages the middle pair", median([10, 20, 30, 40]) === 25);

  // One large debtor is exactly the case medians exist for.
  const balances = [500, 600, 550, 700, 90000];
  check(
    "a single outlier drags the mean but not the median",
    mean(balances)! > 18000 && median(balances) === 600,
    `mean ${Math.round(mean(balances)!)}, median ${median(balances)}`,
  );
}

console.log("\n— trend —");
{
  const up = trend(120, 100);
  check("a rise reports the percentage", up.percentChange === 20 && up.direction === "UP");

  const down = trend(80, 100);
  check("a fall reports a negative percentage", down.percentChange === -20 && down.direction === "DOWN");

  const flat = trend(100, 100);
  check("no change is flat", flat.direction === "FLAT" && flat.percentChange === 0);

  const fromZero = trend(50, 0);
  check(
    "growth from a zero baseline has no percentage",
    fromZero.percentChange === null && fromZero.direction === "NEW",
    "a percentage here would be undefined, not infinite",
  );

  const bothZero = trend(0, 0);
  check("zero to zero is flat, not new", bothZero.direction === "FLAT");

  const toZero = trend(0, 40);
  check("falling to zero is -100%", toZero.percentChange === -100 && toZero.direction === "DOWN");

  const negativeBase = trend(-50, -100);
  check(
    "a negative baseline uses its magnitude",
    negativeBase.percentChange === 50,
    "so improvement from a deficit reads as positive",
  );
}

console.log("\n— receivables aging —");
{
  const now = new Date("2026-08-16T09:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  const buckets = agingBuckets(
    [
      { dueDate: daysAgo(5), amountDue: 1000 },
      { dueDate: daysAgo(45), amountDue: 2000 },
      { dueDate: daysAgo(75), amountDue: 3000 },
      { dueDate: daysAgo(200), amountDue: 4000 },
    ],
    now,
  );

  check("1–30 days captures a recent overdue", buckets[0].count === 1 && buckets[0].amount === 1000);
  check("31–60 days captures a 45-day overdue", buckets[1].count === 1);
  check("61–90 days captures a 75-day overdue", buckets[2].count === 1);
  check("the final bucket is open-ended", buckets[3].count === 1 && buckets[3].amount === 4000);
}

{
  const now = new Date("2026-08-16T09:00:00Z");
  const notYetDue = agingBuckets(
    [{ dueDate: new Date("2026-09-01T00:00:00Z"), amountDue: 5000 }],
    now,
  );
  check(
    "an invoice not yet due is not a receivable",
    notYetDue.every((bucket) => bucket.count === 0),
  );

  const dueToday = agingBuckets(
    [{ dueDate: new Date("2026-08-16T00:00:00Z"), amountDue: 5000 }],
    now,
  );
  check(
    "an invoice due today is current, not one day late",
    dueToday.every((bucket) => bucket.count === 0),
  );

  const settled = agingBuckets([{ dueDate: daysAgoFrom(now, 60), amountDue: 0 }], now);
  check("a settled invoice is excluded", settled.every((bucket) => bucket.count === 0));

  // Boundary: exactly 31 days belongs in the second bucket, not the first.
  const boundary = agingBuckets([{ dueDate: daysAgoFrom(now, 31), amountDue: 100 }], now);
  check(
    "31 days lands in the 31–60 bucket",
    boundary[0].count === 0 && boundary[1].count === 1,
  );
}

function daysAgoFrom(from: Date, n: number): Date {
  return new Date(from.getTime() - n * 86400000);
}

console.log("\n— distribution —");
{
  const bands = [
    { label: "A", min: 80, max: 100 },
    { label: "B", min: 60, max: 79.99 },
    { label: "C", min: 0, max: 59.99 },
  ];
  const result = distribution([95, 85, 70, 65, 40], bands);

  check("values land in the right bands", result.bands[0].count === 2 && result.bands[1].count === 2);
  check("percentages are computed", result.bands[0].percent === 40, `${result.bands[0].percent}%`);
  check("the total is the input size", result.total === 5);

  const withOutliers = distribution([95, 150, -10], bands);
  check(
    "values outside every band are counted, not dropped",
    withOutliers.outOfRange === 2,
    "so the parts still add up to the whole",
  );

  const empty = distribution([], bands);
  check("an empty input yields zero percentages, not NaN", empty.bands.every((b) => b.percent === 0));
}

console.log("\n— ranking small groups —");
{
  const ranked = rankGroups([
    { key: "a", label: "Class 5 A", values: [90, 88, 92, 85, 91, 87] },
    { key: "b", label: "Class 5 B", values: [70, 72, 68, 75, 71, 69] },
    { key: "c", label: "Class 5 C", values: [99, 98] },
  ]);

  check("groups sort by average, highest first", ranked[0].key === "c", `${ranked[0].label}`);
  check(
    "a group below the sample threshold is flagged as not comparable",
    ranked.find((g) => g.key === "c")?.comparable === false,
    "two students will top any average by chance",
  );
  check(
    "adequately sized groups are comparable",
    ranked.filter((g) => g.comparable).length === 2,
  );
  check("sample sizes are reported", ranked.find((g) => g.key === "a")?.sampleSize === 6);

  const custom = rankGroups(
    [{ key: "x", label: "X", values: [1, 2, 3] }],
    { minimumSample: 3 },
  );
  check("the threshold is configurable", custom[0].comparable === true);

  const emptyGroup = rankGroups([{ key: "y", label: "Y", values: [] }]);
  check("a group with no data scores zero and is not comparable",
    emptyGroup[0].value === 0 && !emptyGroup[0].comparable);
}

console.log("\n— slope —");
{
  check("a rising series has a positive slope", (slope([1, 2, 3, 4]) ?? 0) > 0);
  check("a falling series has a negative slope", (slope([4, 3, 2, 1]) ?? 0) < 0);
  check("a flat series has zero slope", slope([5, 5, 5, 5]) === 0);
  check("a single point has no slope", slope([5]) === null, "a trend needs at least two readings");
  check("an empty series has no slope", slope([]) === null);
}

console.log(
  failures === 0
    ? "\nAll analytics checks passed.\n"
    : `\n${failures} analytics check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
