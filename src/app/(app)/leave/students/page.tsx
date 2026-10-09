import { DecidePanel } from "@/app/(app)/leave/students/decide-panel";
import {
  Badge,
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
import {
  countLeaveDays,
  formatLeaveSpan,
  PORTION_SHORT,
  type LeavePortion,
} from "@/lib/student-leave";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Student leave" };

const STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export default async function StudentLeavePage() {
  const session = await requireAnyPermission([
    "studentleave.read",
    "studentleave.approve",
  ]);
  const db = scopedDb(session.schoolId);
  const canDecide = hasPermission(session.permissions, "studentleave.approve");

  const requests = await db.studentLeaveRequest.findMany({
    orderBy: [{ status: "asc" }, { fromDate: "desc" }],
    take: 100,
    include: {
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          enrollments: {
            where: { isActive: true },
            take: 1,
            select: {
              section: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
        },
      },
      requestedBy: { select: { firstName: true, lastName: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
  });

  const pending = requests.filter((row) => row.status === "PENDING");
  const approved = requests.filter((row) => row.status === "APPROVED");

  const today = new Date();
  const todayKey = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  // Who is lawfully out of class right now — the question the front desk is
  // actually asked when a parent turns up to collect a child.
  const outToday = approved.filter(
    (row) =>
      row.fromDate.getTime() <= todayKey && row.toDate.getTime() >= todayKey,
  );
  const halfDays = approved.filter((row) => row.portion !== "FULL_DAY");

  return (
    <>
      <PageHeader
        title="Student leave"
        description="Requests raised by students and guardians from the portal."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Awaiting a decision"
          value={String(pending.length)}
          sublabel={pending.length > 0 ? "families are waiting" : "all clear"}
          tone={pending.length > 0 ? "warning" : "success"}
        />
        <StatTile
          label="Out today"
          value={String(outToday.length)}
          sublabel="approved and in date"
          tone={outToday.length > 0 ? "info" : "neutral"}
        />
        <StatTile label="Approved" value={String(approved.length)} tone="success" />
        <StatTile
          label="Half days"
          value={String(halfDays.length)}
          sublabel="of the approved leave"
        />
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Requests"
            description={
              canDecide
                ? "Pending first. A rejection must carry a reason."
                : "Pending first."
            }
          />
          {requests.length === 0 ? (
            <EmptyState
              title="No leave requests"
              description="Students and guardians raise these from the portal."
            />
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((row) => {
                const section = row.student.enrollments[0]?.section;
                const days = countLeaveDays(
                  row.fromDate,
                  row.toDate,
                  row.portion as LeavePortion,
                );
                return (
                  <li key={row.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`/students/${row.student.id}`}
                            className="text-sm font-semibold underline-offset-2 hover:underline"
                          >
                            {row.student.firstName} {row.student.lastName ?? ""}
                          </a>
                          <Badge tone={STATUS_TONE[row.status]}>
                            {row.status.toLowerCase()}
                          </Badge>
                          {row.portion !== "FULL_DAY" ? (
                            <Badge tone="info">
                              {PORTION_SHORT[row.portion as LeavePortion]}
                            </Badge>
                          ) : null}
                          {row.leavingAfterPeriod ? (
                            <Badge tone="neutral">
                              leaves after period {row.leavingAfterPeriod}
                            </Badge>
                          ) : null}
                        </div>

                        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-strong">
                          {row.reason}
                        </p>

                        {row.decisionNote ? (
                          <p className="mt-1 text-[12px] text-muted">
                            Decision note: {row.decisionNote}
                          </p>
                        ) : null}

                        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span className="font-medium text-muted-strong">
                            {formatLeaveSpan(
                              row.fromDate,
                              row.toDate,
                              row.portion as LeavePortion,
                            )}
                          </span>
                          <span>·</span>
                          <span>
                            {days} {days === 1 ? "day" : "days"}
                          </span>
                          <span>·</span>
                          <span>{row.student.admissionNo}</span>
                          {section ? (
                            <>
                              <span>·</span>
                              <span>
                                {section.classLevel.name} {section.name}
                              </span>
                            </>
                          ) : null}
                          {row.requestedBy ? (
                            <>
                              <span>·</span>
                              <span>
                                asked by {row.requestedBy.firstName}{" "}
                                {row.requestedBy.lastName ?? ""}
                              </span>
                            </>
                          ) : null}
                          {row.decidedBy && row.decidedAt ? (
                            <>
                              <span>·</span>
                              <span>
                                decided by {row.decidedBy.firstName} on{" "}
                                {formatDate(row.decidedAt)}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>

                      {canDecide && row.status === "PENDING" ? (
                        <div className="w-full shrink-0 sm:w-72">
                          <DecidePanel requestId={row.id} />
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
