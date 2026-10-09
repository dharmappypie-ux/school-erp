import { ChildSwitcher } from "@/app/(app)/portal/child-switcher";
import { cancelStudentLeave } from "@/app/(app)/portal/leave/actions";
import { LeaveForm } from "@/app/(app)/portal/leave/leave-form";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  type Tone,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { resolvePortalStudent } from "@/lib/portal";
import {
  countLeaveDays,
  formatLeaveSpan,
  PORTION_SHORT,
  type LeavePortion,
} from "@/lib/student-leave";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Leave" };

const STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export default async function PortalLeavePage({
  searchParams,
}: PageProps<"/portal/leave">) {
  const params = await searchParams;
  const { context, child } = await resolvePortalStudent(params.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);
  const canApply = hasPermission(session.permissions, "studentleave.apply");

  const requests = await db.studentLeaveRequest.findMany({
    where: { studentId: child.id },
    orderBy: [{ fromDate: "desc" }],
    take: 40,
    include: { decidedBy: { select: { firstName: true } } },
  });

  const pending = requests.filter((row) => row.status === "PENDING");

  return (
    <>
      <PageHeader
        title="Leave"
        description={`Ask for time away from school for ${child.firstName}.`}
      />

      <ChildSwitcher students={context.children} selectedId={child.id} />

      {canApply ? (
        <Card>
          <CardHeader
            title="Request leave"
            description="The class teacher sees this straight away and will approve or reject it."
          />
          <LeaveForm childId={child.id} />
        </Card>
      ) : null}

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Your requests"
            description={
              pending.length > 0
                ? `${pending.length} awaiting a decision`
                : "Newest first"
            }
          />
          {requests.length === 0 ? (
            <EmptyState
              title="No leave requested yet"
              description={
                canApply
                  ? "Use the form above when you need time away."
                  : "Nothing has been requested."
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((row) => {
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
                          <p className="text-sm font-semibold">
                            {formatLeaveSpan(
                              row.fromDate,
                              row.toDate,
                              row.portion as LeavePortion,
                            )}
                          </p>
                          <Badge tone={STATUS_TONE[row.status]}>
                            {row.status.toLowerCase()}
                          </Badge>
                          {row.portion !== "FULL_DAY" ? (
                            <Badge tone="info">
                              {PORTION_SHORT[row.portion as LeavePortion]}
                            </Badge>
                          ) : null}
                        </div>

                        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-strong">
                          {row.reason}
                        </p>

                        {row.decisionNote ? (
                          <p className="mt-1 text-[12px] text-muted">
                            School said: {row.decisionNote}
                          </p>
                        ) : null}

                        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span>
                            {days} {days === 1 ? "day" : "days"}
                          </span>
                          {row.leavingAfterPeriod ? (
                            <>
                              <span>·</span>
                              <span>leaves after period {row.leavingAfterPeriod}</span>
                            </>
                          ) : null}
                          <span>·</span>
                          <span>asked {formatDate(row.createdAt)}</span>
                          {row.decidedAt && row.status !== "CANCELLED" ? (
                            <>
                              <span>·</span>
                              <span>
                                answered {formatDate(row.decidedAt)}
                                {row.decidedBy
                                  ? ` by ${row.decidedBy.firstName}`
                                  : ""}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>

                      {canApply && row.status === "PENDING" ? (
                        <form action={cancelStudentLeave} className="shrink-0">
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="child" value={child.id} />
                          <Button type="submit" variant="secondary">
                            Withdraw
                          </Button>
                        </form>
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
