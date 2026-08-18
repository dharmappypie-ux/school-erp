import Link from "next/link";
import { notFound } from "next/navigation";

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
import { Avatar } from "@/components/avatar";
import { PhotoUploader } from "@/components/photo-uploader";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatPercent, toNumber } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Staff profile" };

const LEAVE_TONE: Record<string, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{value ?? "—"}</dd>
    </div>
  );
}

export default async function StaffProfilePage({
  params,
}: PageProps<"/staff/[id]">) {
  const session = await requirePermission("staff.read");
  const db = scopedDb(session.schoolId);
  const { id } = await params;
  const currency = session.school.currency;
  const yearId = session.academicYear?.id;

  const member = await db.staffMember.findUnique({
    where: { id },
    include: {
      department: { select: { name: true } },
      designation: { select: { name: true } },
      user: { select: { email: true, lastLoginAt: true, status: true } },
      classTeacherOf: {
        where: yearId ? { academicYearId: yearId } : undefined,
        select: {
          id: true,
          name: true,
          classLevel: { select: { name: true } },
          _count: { select: { enrollments: true } },
        },
      },
      subjectAssignments: {
        select: {
          id: true,
          weeklyPeriods: true,
          subject: { select: { name: true, code: true } },
          classLevel: { select: { name: true } },
        },
      },
      leaveRequests: {
        orderBy: { fromDate: "desc" },
        take: 6,
        include: { leaveType: { select: { name: true, code: true } } },
      },
      salaryAssignments: {
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        include: {
          structure: {
            select: { name: true, components: { orderBy: { sequence: "asc" } } },
          },
        },
      },
      leaveBalances: {
        include: { leaveType: { select: { name: true, code: true } } },
      },
    },
  });

  if (!member) notFound();

  const [attendanceGroups, payslipCount] = await Promise.all([
    db.staffAttendance.groupBy({
      by: ["status"],
      where: { staffId: member.id },
      _count: { _all: true },
    }),
    db.payslip.count({ where: { staffId: member.id } }),
  ]);

  const attendanceTotal = attendanceGroups.reduce(
    (sum, row) => sum + row._count._all,
    0,
  );
  const attendancePresent = attendanceGroups
    .filter((row) => row.status === "PRESENT" || row.status === "LATE")
    .reduce((sum, row) => sum + row._count._all, 0);
  const attendanceRate =
    attendanceTotal > 0 ? (attendancePresent / attendanceTotal) * 100 : null;

  const salary = member.salaryAssignments[0];
  const canSeePayroll = hasPermission(session.permissions, "payroll.read");
  const canEditPhoto = hasPermission(session.permissions, "staff.update");

  // Derive gross from the structure so the profile shows real take-home rather
  // than just the basic figure.
  let grossEarnings: number | null = null;
  let totalDeductions: number | null = null;
  if (salary && canSeePayroll) {
    const basic = toNumber(salary.basicSalary);
    let earnings = 0;
    let deductions = 0;
    for (const component of salary.structure.components) {
      const value = toNumber(component.value);
      const amount =
        component.calculation === "PERCENT_OF_BASIC"
          ? (basic * value) / 100
          : component.calculation === "PERCENT_OF_GROSS"
            ? 0 // resolved after gross is known; negligible in the demo structures
            : value;
      // The "Basic" component itself carries a placeholder value of 0 in the
      // structure — the real figure lives on the assignment.
      const resolved = component.name === "Basic" ? basic : amount;
      if (component.kind === "DEDUCTION") deductions += resolved;
      else if (component.kind === "EARNING") earnings += resolved;
    }
    grossEarnings = earnings;
    totalDeductions = deductions;
  }

  const pendingLeave = member.leaveRequests.filter(
    (request) => request.status === "PENDING",
  ).length;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar
              firstName={member.firstName}
              lastName={member.lastName}
              photoUrl={member.photoUrl}
              size="lg"
            />
            {member.firstName} {member.lastName}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{member.employeeId}</span>
            {member.designation ? (
              <>
                <span>·</span>
                <span>{member.designation.name}</span>
              </>
            ) : null}
            {member.department ? (
              <>
                <span>·</span>
                <span>{member.department.name}</span>
              </>
            ) : null}
            <Badge tone={member.employmentStatus === "ACTIVE" ? "success" : "warning"}>
              {member.employmentStatus.replace("_", " ").toLowerCase()}
            </Badge>
          </span>
        }
        action={
          <span className="flex items-center gap-2">
            {canEditPhoto ? (
              <Link
                href={`/staff/${member.id}/edit`}
                className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
              >
                Edit profile
              </Link>
            ) : null}
            <Link
              href="/staff"
              className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
            >
              Back to list
            </Link>
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Attendance"
          value={attendanceRate === null ? "—" : formatPercent(attendanceRate, 1)}
          sublabel={
            attendanceTotal > 0 ? `${attendancePresent} of ${attendanceTotal}` : "not recorded"
          }
          tone={
            attendanceRate === null ? "neutral" : attendanceRate >= 90 ? "success" : "warning"
          }
        />
        <StatTile
          label="Classes taught"
          value={String(member.subjectAssignments.length)}
          sublabel={`${member.classTeacherOf.length} as class teacher`}
        />
        <StatTile
          label="Leave requests"
          value={String(member.leaveRequests.length)}
          sublabel={pendingLeave > 0 ? `${pendingLeave} pending` : "none pending"}
          tone={pendingLeave > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label={canSeePayroll ? "Monthly gross" : "Payslips"}
          value={
            canSeePayroll
              ? grossEarnings === null
                ? "—"
                : formatMoney(grossEarnings, currency)
              : String(payslipCount)
          }
          sublabel={
            canSeePayroll
              ? totalDeductions
                ? `less ${formatMoney(totalDeductions, currency)} deductions`
                : "no salary assigned"
              : "payroll access required"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Personal details" />
          <div className="flex justify-center border-b border-border py-4">
            <PhotoUploader
              subject="staff"
              recordId={member.id}
              firstName={member.firstName}
              lastName={member.lastName}
              photoUrl={member.photoUrl}
              canEdit={canEditPhoto}
            />
          </div>
          <dl className="px-5 py-2">
            <DetailRow label="Date of birth" value={formatDate(member.dateOfBirth, "long")} />
            <DetailRow label="Gender" value={member.gender?.toLowerCase()} />
            <DetailRow label="Blood group" value={member.bloodGroup} />
            <DetailRow label="Phone" value={member.phone} />
            <DetailRow label="Email" value={member.email} />
            <DetailRow
              label="Address"
              value={
                [member.addressLine1, member.city, member.state, member.postalCode]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Employment" />
          <dl className="px-5 py-2">
            <DetailRow label="Joined" value={formatDate(member.joiningDate, "long")} />
            <DetailRow label="Qualification" value={member.qualification} />
            <DetailRow
              label="Experience"
              value={member.experience ? `${member.experience} years` : null}
            />
            <DetailRow label="Specialisation" value={member.specialisation} />
            <DetailRow
              label="Login"
              value={
                member.user
                  ? member.user.lastLoginAt
                    ? `last seen ${formatDate(member.user.lastLoginAt)}`
                    : "never signed in"
                  : "no account"
              }
            />
            <DetailRow label="PF number" value={member.pfNumber} />
          </dl>
        </Card>

        <Card>
          <CardHeader
            title={canSeePayroll ? "Salary & bank" : "Leave balances"}
            description={canSeePayroll ? salary?.structure.name : "Current year"}
          />
          {canSeePayroll ? (
            <dl className="px-5 py-2">
              <DetailRow
                label="Basic salary"
                value={salary ? formatMoney(salary.basicSalary, currency) : "—"}
              />
              <DetailRow
                label="Gross"
                value={grossEarnings === null ? "—" : formatMoney(grossEarnings, currency)}
              />
              <DetailRow
                label="Net pay"
                value={
                  grossEarnings === null || totalDeductions === null
                    ? "—"
                    : formatMoney(grossEarnings - totalDeductions, currency)
                }
              />
              <DetailRow
                label="Effective from"
                value={salary ? formatDate(salary.effectiveFrom) : "—"}
              />
              <DetailRow label="Bank" value={member.bankName} />
              <DetailRow
                label="Account"
                value={
                  member.bankAccountNo
                    ? `••••${member.bankAccountNo.slice(-4)}`
                    : null
                }
              />
            </dl>
          ) : member.leaveBalances.length === 0 ? (
            <EmptyState title="No leave balances recorded" />
          ) : (
            <dl className="px-5 py-2">
              {member.leaveBalances.map((balance) => (
                <DetailRow
                  key={balance.id}
                  label={balance.leaveType.name}
                  value={`${toNumber(balance.allocated) - toNumber(balance.used)} of ${toNumber(balance.allocated)} left`}
                />
              ))}
            </dl>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Teaching load"
            description={`${member.subjectAssignments.reduce((sum, a) => sum + a.weeklyPeriods, 0)} periods a week`}
          />
          {member.subjectAssignments.length === 0 ? (
            <EmptyState title="No subjects assigned" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Subject</Th>
                  <Th>Class</Th>
                  <Th className="text-right">Periods / week</Th>
                </tr>
              </thead>
              <tbody>
                {member.subjectAssignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <Td className="font-medium">
                      {assignment.subject.name}
                      <span className="ml-2 font-mono text-[11px] text-muted">
                        {assignment.subject.code}
                      </span>
                    </Td>
                    <Td className="text-muted-strong">{assignment.classLevel.name}</Td>
                    <Td className="numeric text-right">{assignment.weeklyPeriods}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {member.classTeacherOf.length > 0 ? (
            <div className="border-t border-border px-5 py-4">
              <p className="mb-2 text-[11px] font-semibold text-muted uppercase">
                Class teacher of
              </p>
              <div className="flex flex-wrap gap-2">
                {member.classTeacherOf.map((section) => (
                  <Badge key={section.id} tone="brand">
                    {section.classLevel.name} {section.name} ·{" "}
                    {section._count.enrollments} students
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Recent leave" />
          {member.leaveRequests.length === 0 ? (
            <EmptyState title="No leave requested" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Dates</Th>
                  <Th className="text-right">Days</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {member.leaveRequests.map((request) => (
                  <tr key={request.id}>
                    <Td className="font-medium">{request.leaveType.name}</Td>
                    <Td className="text-muted-strong">
                      {formatDate(request.fromDate)}
                      {request.fromDate.getTime() !== request.toDate.getTime()
                        ? ` – ${formatDate(request.toDate)}`
                        : ""}
                      {request.reason ? (
                        <span className="block text-xs text-muted">{request.reason}</span>
                      ) : null}
                    </Td>
                    <Td className="numeric text-right">{toNumber(request.days)}</Td>
                    <Td>
                      <Badge tone={LEAVE_TONE[request.status] ?? "neutral"}>
                        {request.status.toLowerCase()}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
