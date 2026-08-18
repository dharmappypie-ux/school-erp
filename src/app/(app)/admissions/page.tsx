import Link from "next/link";

import { FilterSelect, Pagination, SearchBox } from "@/components/data-controls";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  Table,
  Td,
  Th,
  type Tone,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { PIPELINE_STAGES, STATUS_LABEL } from "@/lib/admissions";
import { formatDate, formatPercent, initials } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";
import type { ApplicationStatus } from "@/generated/prisma/enums";

export const metadata = { title: "Admissions" };

const PAGE_SIZE = 20;

export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  SHORTLISTED: "brand",
  TEST_SCHEDULED: "warning",
  INTERVIEW_SCHEDULED: "warning",
  OFFERED: "brand",
  ACCEPTED: "success",
  ENROLLED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

export default async function AdmissionsPage({
  searchParams,
}: PageProps<"/admissions">) {
  const session = await requirePermission("admissions.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const yearId = session.academicYear?.id;

  const query = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" ? params.status : "";
  const classId = typeof params.class === "string" ? params.class : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.AdmissionApplicationWhereInput = {
    ...(yearId ? { academicYearId: yearId } : {}),
    ...(status ? { status: status as ApplicationStatus } : {}),
    ...(classId ? { classLevelId: classId } : {}),
    ...(query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { applicationNo: { contains: query, mode: "insensitive" } },
            { guardianName: { contains: query, mode: "insensitive" } },
            { guardianPhone: { contains: query } },
          ],
        }
      : {}),
  };

  const [total, applications, classLevels, stageCounts] = await Promise.all([
    db.admissionApplication.count({ where }),
    db.admissionApplication.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        applicationNo: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        status: true,
        source: true,
        score: true,
        submittedAt: true,
        applicationFeePaid: true,
        classLevel: { select: { name: true } },
      },
    }),
    db.classLevel.findMany({
      orderBy: { numericOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.admissionApplication.groupBy({
      by: ["status"],
      where: yearId ? { academicYearId: yearId } : {},
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    stageCounts.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;
  const allApplications = stageCounts.reduce((sum, row) => sum + row._count._all, 0);
  const enrolled = countByStatus.ENROLLED ?? 0;
  const accepted = countByStatus.ACCEPTED ?? 0;
  const rejected = countByStatus.REJECTED ?? 0;
  const inPipeline = PIPELINE_STAGES.reduce(
    (sum, stage) => sum + (countByStatus[stage] ?? 0),
    0,
  );
  const decided = enrolled + accepted + rejected;
  const conversion = decided > 0 ? ((enrolled + accepted) / decided) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Admissions"
        description={
          session.academicYear
            ? `Intake for ${session.academicYear.name}`
            : "No academic year is current"
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Applications" value={String(allApplications)} />
        <StatTile
          label="In pipeline"
          value={String(inPipeline)}
          sublabel="awaiting a decision"
          tone="info"
        />
        <StatTile
          label="Enrolled"
          value={String(enrolled)}
          sublabel={`${accepted} accepted, not yet enrolled`}
          tone="success"
        />
        <StatTile
          label="Offer conversion"
          value={formatPercent(conversion, 0)}
          sublabel={`${rejected} rejected`}
          tone={conversion >= 60 ? "success" : "warning"}
        />
      </div>

      {/* Funnel — each stage links to its filtered list. */}
      <Card className="mt-4">
        <CardHeader title="Pipeline" description="Applications at each stage" />
        <div className="scroll-slim overflow-x-auto px-5 py-4">
          <div className="flex min-w-max items-stretch gap-2">
            {PIPELINE_STAGES.map((stage, index) => {
              const count = countByStatus[stage] ?? 0;
              return (
                <Link
                  key={stage}
                  href={`/admissions?status=${stage}`}
                  className="group flex min-w-[7.5rem] flex-1 flex-col rounded-[var(--radius-base)] border border-border bg-surface-muted px-3 py-2.5 transition-colors hover:bg-surface-hover"
                >
                  <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
                    {index + 1}. {STATUS_LABEL[stage]}
                  </span>
                  <span className="numeric mt-1 text-xl font-semibold group-hover:text-brand">
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <SearchBox placeholder="Search applicant, guardian, application no…" />
          <FilterSelect
            paramName="status"
            label="Status"
            allLabel="All statuses"
            options={Object.entries(STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <FilterSelect
            paramName="class"
            label="Class"
            allLabel="All classes"
            options={classLevels.map((level) => ({
              value: level.id,
              label: level.name,
            }))}
          />
        </div>

        {applications.length === 0 ? (
          <EmptyState
            title="No applications match these filters"
            description="Try clearing the search or choosing a different stage."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Applicant</Th>
                  <Th>Application no.</Th>
                  <Th>Class</Th>
                  <Th>Guardian</Th>
                  <Th>Submitted</Th>
                  <Th className="text-right">Score</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id} className="hover:bg-surface-hover">
                    <Td>
                      <Link
                        href={`/admissions/${application.id}`}
                        className="flex items-center gap-2.5"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
                          {initials(application.firstName, application.lastName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:text-brand">
                            {application.firstName} {application.lastName}
                          </span>
                          {application.source ? (
                            <span className="block text-xs text-muted">
                              via {application.source}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs">{application.applicationNo}</span>
                      {!application.applicationFeePaid ? (
                        <span className="block text-[11px] text-warning">fee unpaid</span>
                      ) : null}
                    </Td>
                    <Td className="text-muted-strong">{application.classLevel.name}</Td>
                    <Td className="text-muted-strong">
                      {application.guardianName}
                      <span className="block text-xs text-muted">
                        {application.guardianPhone}
                      </span>
                    </Td>
                    <Td className="text-muted-strong">
                      {application.submittedAt
                        ? formatDate(application.submittedAt)
                        : "not submitted"}
                    </Td>
                    <Td className="numeric text-right">
                      {application.score === null ? "—" : String(application.score)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[application.status] ?? "neutral"}>
                        {STATUS_LABEL[application.status]}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-border">
              <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} total={total} />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
