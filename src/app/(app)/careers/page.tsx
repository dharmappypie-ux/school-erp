import { setJobStatus } from "@/app/(app)/careers/actions";
import { JobForm } from "@/app/(app)/careers/job-form";
import { DrawerForm } from "@/components/drawer-form";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  type Tone,
} from "@/components/ui";
import { requireAnyPermission } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Careers" };

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "warning",
  OPEN: "success",
  CLOSED: "neutral",
  FILLED: "info",
};

export default async function CareersPage() {
  const session = await requireAnyPermission(["careers.read", "careers.manage"]);
  const db = scopedDb(session.schoolId);
  const canManage = hasPermission(session.permissions, "careers.manage");
  const now = new Date();

  const jobs = await db.jobPosting.findMany({
    // A reader with careers.read only is usually front desk fielding calls —
    // they need the live adverts, not half-written drafts.
    where: canManage ? {} : { status: { in: ["OPEN", "CLOSED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { _count: { select: { applications: true } } },
  });

  const open = jobs.filter((job) => job.status === "OPEN");
  const drafts = jobs.filter((job) => job.status === "DRAFT");
  // An open post past its closing date is still accepting applications it will
  // not honour — it needs closing by hand, so surface the count.
  const lapsed = open.filter(
    (job) => job.closingDate !== null && job.closingDate < now,
  );
  const applications = jobs.reduce(
    (total, job) => total + job._count.applications,
    0,
  );

  return (
    <>
      <PageHeader
        title="Careers"
        description="Vacancies advertised by the school and the applications against them."
        action={
          canManage ? (
            <DrawerForm
              trigger="New posting"
              title="New job posting"
              description="Publish now or keep it as a draft"
              width="w-[34rem]"
            >
              <JobForm bare />
            </DrawerForm>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Open"
          value={String(open.length)}
          sublabel="accepting applications"
          tone={open.length > 0 ? "success" : "neutral"}
        />
        <StatTile
          label="Applications"
          value={String(applications)}
          sublabel="across all postings"
        />
        <StatTile
          label="Past closing date"
          value={String(lapsed.length)}
          sublabel={lapsed.length > 0 ? "still showing as open" : "none"}
          tone={lapsed.length > 0 ? "danger" : "success"}
        />
        {canManage ? (
          <StatTile
            label="Drafts"
            value={String(drafts.length)}
            sublabel={drafts.length > 0 ? "not advertised" : "none waiting"}
            tone={drafts.length > 0 ? "warning" : "neutral"}
          />
        ) : (
          <StatTile label="Listed" value={String(jobs.length)} />
        )}
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Postings"
            description="Quote the reference to applicants — it is unique to this school"
          />
          {jobs.length === 0 ? (
            <EmptyState
              title="No postings yet"
              description={
                canManage
                  ? "Create one with “New posting” at the top right."
                  : "Nothing is being advertised."
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {jobs.map((job) => {
                const isLapsed =
                  job.status === "OPEN" &&
                  job.closingDate !== null &&
                  job.closingDate < now;
                return (
                  <li key={job.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{job.title}</p>
                          <Badge tone={STATUS_TONE[job.status]}>
                            {job.status.toLowerCase()}
                          </Badge>
                          {isLapsed ? (
                            <Badge tone="danger">Past closing date</Badge>
                          ) : null}
                          <Badge tone="info">{job.category}</Badge>
                        </div>

                        {job.description ? (
                          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-strong">
                            {job.description}
                          </p>
                        ) : null}

                        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span className="font-mono">{job.reference}</span>
                          <span>·</span>
                          <span>
                            {job.vacancies}{" "}
                            {job.vacancies === 1 ? "vacancy" : "vacancies"}
                          </span>
                          {job.minExperience !== null ? (
                            <>
                              <span>·</span>
                              <span>{job.minExperience}+ yrs</span>
                            </>
                          ) : (
                            <>
                              <span>·</span>
                              <span>freshers may apply</span>
                            </>
                          )}
                          {job.qualification ? (
                            <>
                              <span>·</span>
                              <span>{job.qualification}</span>
                            </>
                          ) : null}
                          {job.salaryRange ? (
                            <>
                              <span>·</span>
                              <span>{job.salaryRange}</span>
                            </>
                          ) : null}
                          {job.closingDate ? (
                            <>
                              <span>·</span>
                              <span>closes {formatDate(job.closingDate)}</span>
                            </>
                          ) : null}
                          <span>·</span>
                          <span>
                            {job._count.applications}{" "}
                            {job._count.applications === 1
                              ? "application"
                              : "applications"}
                          </span>
                        </p>
                      </div>

                      {canManage ? (
                        <div className="flex shrink-0 gap-2">
                          {job.status === "DRAFT" ? (
                            <form action={setJobStatus}>
                              <input type="hidden" name="id" value={job.id} />
                              <input type="hidden" name="status" value="OPEN" />
                              <Button type="submit">Publish</Button>
                            </form>
                          ) : null}
                          {job.status === "OPEN" ? (
                            <>
                              <form action={setJobStatus}>
                                <input type="hidden" name="id" value={job.id} />
                                <input type="hidden" name="status" value="FILLED" />
                                <Button type="submit" variant="secondary">
                                  Filled
                                </Button>
                              </form>
                              <form action={setJobStatus}>
                                <input type="hidden" name="id" value={job.id} />
                                <input type="hidden" name="status" value="CLOSED" />
                                <Button type="submit" variant="secondary">
                                  Close
                                </Button>
                              </form>
                            </>
                          ) : null}
                          {job.status === "CLOSED" || job.status === "FILLED" ? (
                            <form action={setJobStatus}>
                              <input type="hidden" name="id" value={job.id} />
                              <input type="hidden" name="status" value="OPEN" />
                              <Button type="submit" variant="secondary">
                                Reopen
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
