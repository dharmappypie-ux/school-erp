import Link from "next/link";

import { RefreshButton } from "@/app/(app)/insights/refresh-button";
import { FilterSelect } from "@/components/data-controls";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
  type Tone,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDateTime, toNumber } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";
import type { RiskFactor } from "@/lib/ai/risk";

export const metadata = { title: "AI insights" };

const LEVEL_TONE: Record<string, Tone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "success",
};

export default async function InsightsPage({
  searchParams,
}: PageProps<"/insights">) {
  const session = await requirePermission("ai.insights");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const yearId = session.academicYear?.id;

  const level = typeof params.level === "string" ? params.level : "";

  const [scores, counts] = await Promise.all([
    yearId
      ? db.riskScore.findMany({
          where: {
            academicYearId: yearId,
            kind: "DROPOUT",
            ...(level ? { level: level as "LOW" } : { level: { in: ["MEDIUM", "HIGH", "CRITICAL"] } }),
          },
          orderBy: { score: "desc" },
          take: 50,
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                admissionNo: true,
                enrollments: {
                  where: { academicYearId: yearId },
                  take: 1,
                  select: {
                    section: {
                      select: { name: true, classLevel: { select: { name: true } } },
                    },
                  },
                },
              },
            },
          },
        })
      : [],
    yearId
      ? db.riskScore.groupBy({
          by: ["level"],
          where: { academicYearId: yearId, kind: "DROPOUT" },
          _count: { _all: true },
        })
      : [],
  ]);

  const countByLevel = Object.fromEntries(
    counts.map((row) => [row.level, row._count._all]),
  ) as Record<string, number>;
  const totalScored = counts.reduce((sum, row) => sum + row._count._all, 0);
  const lastComputed = scores[0]?.computedAt ?? null;

  return (
    <>
      <PageHeader
        title="AI insights"
        description="Explainable dropout-risk scoring across attendance, academics, fees, homework and conduct."
        action={<RefreshButton />}
      />

      {totalScored === 0 ? (
        <Alert tone="info" title="No scores computed yet">
          Press <strong>Recompute scores</strong> to run the risk model across
          every active student. It reads existing attendance, marks, fee and
          homework data — nothing extra needs to be entered.
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Students scored"
              value={String(totalScored)}
              sublabel={lastComputed ? `Updated ${formatDateTime(lastComputed)}` : undefined}
            />
            <StatTile
              label="Critical risk"
              value={String(countByLevel.CRITICAL ?? 0)}
              sublabel="immediate intervention"
              tone="danger"
              href="/insights?level=CRITICAL"
            />
            <StatTile
              label="High risk"
              value={String(countByLevel.HIGH ?? 0)}
              sublabel="contact guardians"
              tone="danger"
              href="/insights?level=HIGH"
            />
            <StatTile
              label="Low risk"
              value={String(countByLevel.LOW ?? 0)}
              sublabel="routine monitoring"
              tone="success"
              href="/insights?level=LOW"
            />
          </div>

          <Card className="mt-4">
            <CardHeader
              title="Students by risk"
              description={
                level
                  ? `Filtered to ${level.toLowerCase()} risk`
                  : "Showing medium risk and above"
              }
              action={
                <FilterSelect
                  paramName="level"
                  label="Risk level"
                  allLabel="Medium and above"
                  options={[
                    { value: "CRITICAL", label: "Critical" },
                    { value: "HIGH", label: "High" },
                    { value: "MEDIUM", label: "Medium" },
                    { value: "LOW", label: "Low" },
                  ]}
                />
              }
            />

            {scores.length === 0 ? (
              <EmptyState
                title="No students at this risk level"
                description="That is good news — try a different filter to see the rest."
              />
            ) : (
              <ul className="divide-y divide-border">
                {scores.map((score) => {
                  const factors = (score.factors as unknown as RiskFactor[]) ?? [];
                  const enrollment = score.student.enrollments[0];
                  const leading = [...factors]
                    .filter((factor) => factor.points > 0)
                    .sort((a, b) => b.points - a.points)
                    .slice(0, 3);

                  return (
                    <li key={score.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/students/${score.student.id}`}
                            className="text-sm font-semibold hover:text-brand"
                          >
                            {score.student.firstName} {score.student.lastName}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted">
                            {score.student.admissionNo}
                            {enrollment
                              ? ` · ${enrollment.section.classLevel.name} ${enrollment.section.name}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="numeric text-lg font-semibold">
                            {toNumber(score.score).toFixed(0)}
                            <span className="text-xs text-muted">/100</span>
                          </span>
                          <Badge tone={LEVEL_TONE[score.level] ?? "neutral"}>
                            {score.level.toLowerCase()}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-3">
                        <ProgressBar
                          value={toNumber(score.score)}
                          tone={LEVEL_TONE[score.level] ?? "neutral"}
                        />
                      </div>

                      {score.explanation ? (
                        <p className="mt-2.5 text-[13px] text-muted-strong">
                          {score.explanation}
                        </p>
                      ) : null}

                      {leading.length > 0 ? (
                        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                          {leading.map((factor) => (
                            <div
                              key={factor.key}
                              className="rounded-[var(--radius-base)] bg-surface-muted px-3 py-2"
                            >
                              <dt className="flex items-baseline justify-between text-[11px] font-medium text-muted">
                                {factor.label}
                                <span className="numeric text-foreground">
                                  {factor.points.toFixed(0)}/{factor.maxPoints}
                                </span>
                              </dt>
                              <dd className="mt-1 text-[11px] leading-snug text-muted">
                                {factor.detail}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      <Card className="mt-4">
        <CardHeader
          title="How this score is calculated"
          description="The model is a transparent weighted sum, not a black box."
        />
        <div className="px-5 py-4 text-[13px] leading-relaxed text-muted-strong">
          <p>
            Each signal contributes a bounded number of points, so any score can
            be explained to a parent or an inspector:
          </p>
          <ul className="mt-3 space-y-1.5">
            <li>
              <strong>Attendance (0–35)</strong> — attendance rate, plus a
              penalty for consecutive-absence runs.
            </li>
            <li>
              <strong>Academic performance (0–25)</strong> — average marks, plus
              a penalty when the term-over-term average falls.
            </li>
            <li>
              <strong>Fee arrears (0–20)</strong> — unpaid proportion and how
              long it has been overdue.
            </li>
            <li>
              <strong>Homework (0–12)</strong> — share of assignments not
              submitted.
            </li>
            <li>
              <strong>Conduct (0–8)</strong> — unreturned school property as a
              proxy signal.
            </li>
          </ul>
          <p className="mt-3">
            Thresholds: 70+ critical, 50–69 high, 28–49 medium, below 28 low. A
            student with too little data on a signal scores zero for it rather
            than being penalised for the gap.
          </p>
        </div>
      </Card>
    </>
  );
}
