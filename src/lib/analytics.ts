/**
 * Analytics helpers.
 *
 * Dashboards mislead in predictable ways — a percentage change from a zero
 * baseline, a mean dragged by one outlier, a "class average" computed from
 * three students and ranked against one of forty. These functions are written
 * to refuse those readings rather than render them confidently.
 */

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * The median, which is the honest centre for skewed data such as fee
 * balances, where a handful of large debtors pull the mean far above what a
 * typical family owes.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export type TrendDirection = "UP" | "DOWN" | "FLAT" | "NEW" | "UNKNOWN";

export interface Trend {
  current: number;
  previous: number;
  change: number;
  /** Null when a percentage would be meaningless — see below. */
  percentChange: number | null;
  direction: TrendDirection;
}

/**
 * Period-over-period comparison.
 *
 * A percentage change from a zero baseline is undefined, not infinite and not
 * 100%. It is reported as `null` with direction `NEW`, so the UI can say
 * "new" instead of inventing a number nobody can act on.
 */
export function trend(current: number, previous: number): Trend {
  const change = current - previous;

  if (previous === 0) {
    return {
      current,
      previous,
      change,
      percentChange: null,
      direction: current === 0 ? "FLAT" : "NEW",
    };
  }

  const percentChange = (change / Math.abs(previous)) * 100;
  return {
    current,
    previous,
    change,
    percentChange: Math.round(percentChange * 10) / 10,
    direction: change > 0 ? "UP" : change < 0 ? "DOWN" : "FLAT",
  };
}

export interface AgingBucket {
  label: string;
  /** Inclusive lower bound in days overdue. */
  from: number;
  /** Exclusive upper bound; null means open-ended. */
  to: number | null;
  count: number;
  amount: number;
}

/**
 * Receivables grouped by how long they have been overdue.
 *
 * Age is measured in whole days from the due date, so an invoice due today is
 * current rather than one day late. Anything not yet due is excluded — it is
 * not a receivable problem.
 */
export function agingBuckets(
  invoices: readonly { dueDate: Date; amountDue: number }[],
  asOf: Date = new Date(),
): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: "1–30 days", from: 1, to: 31, count: 0, amount: 0 },
    { label: "31–60 days", from: 31, to: 61, count: 0, amount: 0 },
    { label: "61–90 days", from: 61, to: 91, count: 0, amount: 0 },
    { label: "Over 90 days", from: 91, to: null, count: 0, amount: 0 },
  ];

  const start = new Date(asOf);
  start.setHours(0, 0, 0, 0);

  for (const invoice of invoices) {
    if (invoice.amountDue <= 0) continue;

    const due = new Date(invoice.dueDate);
    due.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor((start.getTime() - due.getTime()) / 86400000);
    if (daysOverdue < 1) continue; // not yet overdue

    const bucket = buckets.find(
      (entry) =>
        daysOverdue >= entry.from && (entry.to === null || daysOverdue < entry.to),
    );
    if (bucket) {
      bucket.count += 1;
      bucket.amount += invoice.amountDue;
    }
  }

  return buckets;
}

export interface DistributionBand {
  label: string;
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
  count: number;
  percent: number;
}

/**
 * Buckets values into labelled bands — a grade histogram, for instance.
 * Values outside every band are counted in `outOfRange` rather than dropped,
 * so the parts always add up to the whole.
 */
export function distribution(
  values: readonly number[],
  bands: readonly { label: string; min: number; max: number }[],
): { bands: DistributionBand[]; total: number; outOfRange: number } {
  const result: DistributionBand[] = bands.map((band) => ({
    ...band,
    count: 0,
    percent: 0,
  }));
  let outOfRange = 0;

  for (const value of values) {
    const band = result.find(
      (entry) => value >= entry.min && value <= entry.max,
    );
    if (band) band.count += 1;
    else outOfRange += 1;
  }

  const total = values.length;
  for (const band of result) {
    band.percent = total > 0 ? Math.round((band.count / total) * 1000) / 10 : 0;
  }

  return { bands: result, total, outOfRange };
}

export interface RankedGroup {
  key: string;
  label: string;
  value: number;
  sampleSize: number;
  /** False when the group is too small to compare fairly. */
  comparable: boolean;
}

/**
 * Ranks groups while marking those too small to compare.
 *
 * A section of three students will routinely top or bottom any average by
 * chance alone. Such groups are still returned — hiding them would be its own
 * distortion — but flagged so the UI does not present them as findings.
 */
export function rankGroups(
  groups: readonly { key: string; label: string; values: readonly number[] }[],
  options: { minimumSample?: number } = {},
): RankedGroup[] {
  const minimum = options.minimumSample ?? 5;

  return groups
    .map((group) => ({
      key: group.key,
      label: group.label,
      value: mean(group.values) ?? 0,
      sampleSize: group.values.length,
      comparable: group.values.length >= minimum,
    }))
    .sort((a, b) => b.value - a.value);
}

/** A simple linear-regression slope, for "is this rising or falling?". */
export function slope(values: readonly number[]): number | null {
  const n = values.length;
  if (n < 2) return null;

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (i - meanX) * (values[i] - meanY);
    denominator += (i - meanX) ** 2;
  }

  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}
