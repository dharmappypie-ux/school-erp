import Link from "next/link";

import { RunPanel } from "@/app/(app)/payroll/run-panel";
import {
  Alert,
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
import { Avatar } from "@/components/avatar";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Payroll" };

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  APPROVED: "info",
  PAID: "success",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function PayrollPage({ searchParams }: PageProps<"/payroll">) {
  const session = await requirePermission("payroll.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const currency = session.school.currency;

  const now = new Date();
  const month = Math.min(12, Math.max(1, Number(params.month) || now.getMonth() + 1));
  const year = Number(params.year) || now.getFullYear();

  const [payslips, structures, staffWithoutSalary, activeStaff] = await Promise.all([
    db.payslip.findMany({
      where: { month, year },
      orderBy: { netPay: "desc" },
      include: {
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
        lines: { orderBy: { sequence: "asc" } },
      },
    }),
    db.salaryStructure.findMany({
      where: { isActive: true },
      include: {
        components: { orderBy: { sequence: "asc" } },
        _count: { select: { assignments: true } },
      },
    }),
    db.staffMember.count({
      where: {
        employmentStatus: "ACTIVE",
        deletedAt: null,
        salaryAssignments: { none: {} },
      },
    }),
    db.staffMember.count({ where: { employmentStatus: "ACTIVE", deletedAt: null } }),
  ]);

  const grossTotal = payslips.reduce(
    (sum, slip) => sum + toNumber(slip.grossEarnings),
    0,
  );
  const netTotal = payslips.reduce((sum, slip) => sum + toNumber(slip.netPay), 0);
  const deductionTotal = payslips.reduce(
    (sum, slip) => sum + toNumber(slip.totalDeductions),
    0,
  );
  const paidCount = payslips.filter((slip) => slip.status === "PAID").length;

  const canManage = hasPermission(session.permissions, "payroll.manage");

  return (
    <>
      <PageHeader
        title="Payroll"
        description={`${MONTHS[month - 1]} ${year}`}
      />

      {staffWithoutSalary > 0 ? (
        <div className="mb-4">
          <Alert tone="warning" title={`${staffWithoutSalary} staff without a salary structure`}>
            They are skipped by the payroll run and will not be paid until a
            salary is assigned.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Payslips"
          value={String(payslips.length)}
          sublabel={`${activeStaff} active staff`}
          tone={payslips.length > 0 ? "info" : "neutral"}
        />
        <StatTile
          label="Gross"
          value={formatMoney(grossTotal, currency)}
          sublabel={`less ${formatMoney(deductionTotal, currency)} deductions`}
        />
        <StatTile
          label="Net payable"
          value={formatMoney(netTotal, currency)}
          sublabel={`${paidCount} of ${payslips.length} paid`}
          tone={paidCount === payslips.length && payslips.length > 0 ? "success" : "warning"}
        />
        <StatTile
          label="Structures"
          value={String(structures.length)}
          sublabel={`${structures.reduce((sum, s) => sum + s._count.assignments, 0)} assignments`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Payslips"
            description={`${MONTHS[month - 1]} ${year} · highest net pay first`}
          />
          {payslips.length === 0 ? (
            <EmptyState
              title="No payslips for this month"
              description={
                canManage
                  ? "Use the panel alongside to generate them."
                  : "Ask an administrator to run payroll."
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Staff</Th>
                  <Th className="text-right">Days</Th>
                  <Th className="text-right">Gross</Th>
                  <Th className="text-right">Deductions</Th>
                  <Th className="text-right">Net pay</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((slip) => (
                  <tr key={slip.id} className="hover:bg-surface-hover">
                    <Td>
                      <Link
                        href={`/staff/${slip.staff.id}`}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar
                          firstName={slip.staff.firstName}
                          lastName={slip.staff.lastName}
                          photoUrl={slip.staff.photoUrl}
                          size="sm"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:text-brand">
                            {slip.staff.firstName} {slip.staff.lastName}
                          </span>
                          <span className="block font-mono text-[11px] text-muted">
                            {slip.staff.employeeId}
                            {slip.staff.designation
                              ? ` · ${slip.staff.designation.name}`
                              : ""}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td className="numeric text-right text-muted-strong">
                      {toNumber(slip.paidDays)}/{slip.workingDays}
                      {toNumber(slip.lopDays) > 0 ? (
                        <span className="block text-[11px] text-danger">
                          {toNumber(slip.lopDays)} LOP
                        </span>
                      ) : null}
                    </Td>
                    <Td className="numeric text-right">
                      {formatMoney(slip.grossEarnings, currency)}
                    </Td>
                    <Td className="numeric text-right text-muted-strong">
                      {formatMoney(slip.totalDeductions, currency)}
                    </Td>
                    <Td className="numeric text-right font-semibold">
                      {formatMoney(slip.netPay, currency)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[slip.status] ?? "neutral"}>
                        {slip.status.toLowerCase()}
                      </Badge>
                      {slip.paidOn ? (
                        <span className="block text-[11px] text-muted">
                          {formatDate(slip.paidOn)}
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Run payroll" description="Generate and settle" />
          <RunPanel defaultMonth={month} defaultYear={year} canManage={canManage} />
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Salary structures"
          description="Components applied to each assigned staff member"
        />
        {structures.length === 0 ? (
          <EmptyState title="No salary structures configured" />
        ) : (
          <div className="divide-y divide-border">
            {structures.map((structure) => (
              <div key={structure.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{structure.name}</p>
                  <Badge tone="neutral">
                    {structure._count.assignments} assigned
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {structure.components.map((component) => (
                    <span
                      key={component.id}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        component.kind === "DEDUCTION"
                          ? "bg-danger-soft text-danger"
                          : component.kind === "EMPLOYER_CONTRIBUTION"
                            ? "bg-info-soft text-info"
                            : "bg-success-soft text-success"
                      }`}
                    >
                      {component.name}:{" "}
                      {component.calculation === "FIXED"
                        ? formatMoney(component.value, currency)
                        : `${toNumber(component.value)}% of ${
                            component.calculation === "PERCENT_OF_BASIC" ? "basic" : "gross"
                          }`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        Unpaid leave prorates earnings only — statutory deductions such as
        professional tax are not reduced. Net pay never goes below zero.
      </p>
    </>
  );
}
