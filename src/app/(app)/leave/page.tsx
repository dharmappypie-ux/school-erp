import Link from "next/link";

import { DecideButtons } from "@/app/(app)/leave/decide-buttons";
import { FilterSelect } from "@/components/data-controls";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
  Table,
  Td,
  Th,
  type Tone,
} from "@/components/ui";
import { requireAnyPermission } from "@/lib/auth";
import { Avatar } from "@/components/avatar";
import { formatDate, relativeDays, toNumber } from "@/lib/format";
import { availableBalance } from "@/lib/leave";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Leave" };

const STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export default async function LeavePage({ searchParams }: PageProps<"/leave">) {
  const session = await requireAnyPermission(["leave.read", "leave.apply"]);
  const db = scopedDb(session.schoolId);
  const params = await searchParams;

  const status = typeof params.status === "string" ? params.status : "";
  const canApprove = hasPermission(session.permissions, "leave.approve");
  const year = new Date().getFullYear();

  // Staff without approval rights see only their own requests.
  const ownOnly = !canApprove && session.staffId;

  const where: Prisma.LeaveRequestWhereInput = {
    ...(status ? { status: status as Prisma.EnumLeaveStatusFilter["equals"] } : {}),
    ...(ownOnly ? { staffId: session.staffId! } : {}),
  };

  const [requests, counts, leaveTypes, balances, holidays] = await Promise.all([
    db.leaveRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { fromDate: "desc" }],
      take: 50,
      include: {
        leaveType: { select: { name: true, code: true, isPaid: true } },
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            employeeId: true,
            designation: { select: { name: true } },
          },
        },
        approver: { select: { firstName: true, lastName: true } },
      },
    }),
    db.leaveRequest.groupBy({
      by: ["status"],
      where: ownOnly ? { staffId: session.staffId! } : {},
      _count: { _all: true },
    }),
    db.leaveType.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, annualQuota: true, isPaid: true },
    }),
    session.staffId
      // tenant-safe: filtered by session.staffId, which is already bound to this school.
      ? db.leaveBalance.findMany({
          where: { staffId: session.staffId, year },
          include: { leaveType: { select: { name: true, code: true } } },
        })
      : [],
    db.holiday.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 6,
      select: { id: true, name: true, date: true, endDate: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    counts.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;

  const pendingDays = requests
    .filter((request) => request.status === "PENDING")
    .reduce((sum, request) => sum + toNumber(request.days), 0);

  return (
    <>
      <PageHeader
        title="Leave"
        description={
          canApprove
            ? "Requests across all staff"
            : "Your leave requests and balances"
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Pending"
          value={String(byStatus.PENDING ?? 0)}
          sublabel={`${pendingDays} days awaiting a decision`}
          tone={(byStatus.PENDING ?? 0) > 0 ? "warning" : "success"}
        />
        <StatTile label="Approved" value={String(byStatus.APPROVED ?? 0)} tone="success" />
        <StatTile label="Rejected" value={String(byStatus.REJECTED ?? 0)} tone="neutral" />
        <StatTile
          label="Leave types"
          value={String(leaveTypes.length)}
          sublabel={`${leaveTypes.filter((type) => !type.isPaid).length} unpaid`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Requests"
            description="Pending first"
            action={
              <FilterSelect
                paramName="status"
                label="Status"
                allLabel="All statuses"
                options={Object.keys(STATUS_TONE).map((value) => ({
                  value,
                  label: value.toLowerCase(),
                }))}
              />
            }
          />
          {requests.length === 0 ? (
            <EmptyState title="No leave requests" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Staff</Th>
                  <Th>Type</Th>
                  <Th>Dates</Th>
                  <Th className="text-right">Days</Th>
                  <Th>Status</Th>
                  {canApprove ? <Th /> : null}
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="hover:bg-surface-hover">
                    <Td>
                      <Link
                        href={`/staff/${request.staff.id}`}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar
                          firstName={request.staff.firstName}
                          lastName={request.staff.lastName}
                          photoUrl={request.staff.photoUrl}
                          size="sm"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:text-brand">
                            {request.staff.firstName} {request.staff.lastName}
                          </span>
                          <span className="block font-mono text-[11px] text-muted">
                            {request.staff.employeeId}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      {request.leaveType.name}
                      {!request.leaveType.isPaid ? (
                        <Badge tone="danger" className="ml-1.5">
                          unpaid
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-muted-strong">
                      {formatDate(request.fromDate)}
                      {request.fromDate.getTime() !== request.toDate.getTime()
                        ? ` – ${formatDate(request.toDate)}`
                        : ""}
                      <span className="block text-[11px] text-muted">
                        {relativeDays(request.fromDate)}
                        {request.reason ? ` · ${request.reason}` : ""}
                      </span>
                    </Td>
                    <Td className="numeric text-right">{toNumber(request.days)}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[request.status] ?? "neutral"}>
                        {request.status.toLowerCase()}
                      </Badge>
                      {request.approver ? (
                        <span className="block text-[11px] text-muted">
                          by {request.approver.firstName}
                        </span>
                      ) : null}
                    </Td>
                    {canApprove ? (
                      <Td className="text-right">
                        {request.status === "PENDING" ? (
                          <DecideButtons requestId={request.id} />
                        ) : (
                          <span className="text-[11px] text-muted">
                            {formatDate(request.decidedAt)}
                          </span>
                        )}
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-4">
          {session.staffId ? (
            <Card>
              <CardHeader title="Your balances" description={`Year ${year}`} />
              {balances.length === 0 ? (
                <EmptyState
                  title="No balances recorded"
                  description="Allocations appear once leave is granted for the year."
                />
              ) : (
                <div className="divide-y divide-border">
                  {balances.map((balance) => {
                    const available = availableBalance({
                      allocated: toNumber(balance.allocated),
                      used: toNumber(balance.used),
                      carried: toNumber(balance.carried),
                    });
                    const allocated = toNumber(balance.allocated) + toNumber(balance.carried);
                    return (
                      <div key={balance.id} className="px-5 py-3">
                        <div className="flex items-baseline justify-between text-sm">
                          <span>{balance.leaveType.name}</span>
                          <span className="numeric font-medium">
                            {available} / {allocated}
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <ProgressBar
                            value={allocated > 0 ? (available / allocated) * 100 : 0}
                            tone={available <= 0 ? "danger" : available <= 2 ? "warning" : "success"}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Leave types" description="School policy" />
            <ul className="divide-y divide-border">
              {leaveTypes.map((type) => (
                <li
                  key={type.id}
                  className="flex items-center justify-between gap-3 px-5 py-2.5"
                >
                  <span className="text-sm">
                    {type.name}
                    <span className="ml-1.5 font-mono text-[11px] text-muted">
                      {type.code}
                    </span>
                  </span>
                  <span className="numeric text-xs text-muted">
                    {toNumber(type.annualQuota) > 0
                      ? `${toNumber(type.annualQuota)} days`
                      : "unpaid"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Upcoming holidays" />
            {holidays.length === 0 ? (
              <EmptyState title="No holidays scheduled" />
            ) : (
              <ul className="divide-y divide-border">
                {holidays.map((holiday) => (
                  <li key={holiday.id} className="px-5 py-2.5">
                    <p className="text-sm font-medium">{holiday.name}</p>
                    <p className="text-[11px] text-muted">
                      {formatDate(holiday.date, "long")}
                      {holiday.endDate ? ` – ${formatDate(holiday.endDate, "long")}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        Weekly offs and declared holidays inside a leave range are not charged
        against the balance. Approving debits the balance in the same
        transaction; reversing an approval returns the days.
      </p>
    </>
  );
}
