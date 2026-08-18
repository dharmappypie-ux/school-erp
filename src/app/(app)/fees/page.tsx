import Link from "next/link";

import { CollectForm } from "@/app/(app)/fees/collect-form";
import { FilterSelect, Pagination, SearchBox } from "@/components/data-controls";
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
import { requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, formatPercent, toNumber } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Fees" };

const PAGE_SIZE = 20;

const STATUS_TONE: Record<string, Tone> = {
  PAID: "success",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  OVERDUE: "danger",
  DRAFT: "neutral",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
  WRITTEN_OFF: "neutral",
};

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfTomorrow(): Date {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

export default async function FeesPage({ searchParams }: PageProps<"/fees">) {
  const session = await requirePermission("fees.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const currency = session.school.currency;
  const yearId = session.academicYear?.id;

  const query = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" ? params.status : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.InvoiceWhereInput = {
    ...(yearId ? { academicYearId: yearId } : {}),
    ...(status ? { status: status as Prisma.EnumInvoiceStatusFilter["equals"] } : {}),
    ...(query
      ? {
          OR: [
            { invoiceNo: { contains: query, mode: "insensitive" } },
            { student: { firstName: { contains: query, mode: "insensitive" } } },
            { student: { lastName: { contains: query, mode: "insensitive" } } },
            { student: { admissionNo: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [totals, collectedToday, overdueAgg, total, invoices, defaulters] =
    await Promise.all([
      db.invoice.aggregate({
        where: yearId ? { academicYearId: yearId } : {},
        _sum: { total: true, amountPaid: true, amountDue: true },
        _count: { _all: true },
      }),
      db.payment.aggregate({
        where: {
          status: "SUCCESS",
          // Bounded on both sides: an open-ended `gte` would also count
          // payments dated in the future.
          paidAt: { gte: startOfToday(), lt: startOfTomorrow() },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      db.invoice.aggregate({
        where: {
          ...(yearId ? { academicYearId: yearId } : {}),
          amountDue: { gt: 0 },
          dueDate: { lt: new Date() },
        },
        _sum: { amountDue: true },
        _count: { _all: true },
      }),
      db.invoice.count({ where }),
      db.invoice.findMany({
        where,
        orderBy: [{ dueDate: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, invoiceNo: true, period: true, dueDate: true, total: true,
          amountPaid: true, amountDue: true, status: true,
          student: {
            select: { id: true, firstName: true, lastName: true, admissionNo: true },
          },
        },
      }),
      // Students carrying a balance, worst first — the collection worklist.
      db.invoice.groupBy({
        by: ["studentId"],
        where: {
          ...(yearId ? { academicYearId: yearId } : {}),
          amountDue: { gt: 0 },
        },
        _sum: { amountDue: true },
        orderBy: { _sum: { amountDue: "desc" } },
        take: 40,
      }),
    ]);

  const billed = toNumber(totals._sum.total);
  const collected = toNumber(totals._sum.amountPaid);
  const outstanding = toNumber(totals._sum.amountDue);
  const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;

  const defaulterIds = defaulters.map((row) => row.studentId);
  const defaulterStudents = defaulterIds.length
    ? await db.student.findMany({
        where: { id: { in: defaulterIds } },
        select: {
          id: true, firstName: true, lastName: true, admissionNo: true,
          enrollments: {
            where: yearId ? { academicYearId: yearId } : undefined,
            take: 1,
            select: {
              section: { select: { name: true, classLevel: { select: { name: true } } } },
            },
          },
        },
      })
    : [];
  const studentById = new Map(defaulterStudents.map((student) => [student.id, student]));

  const canCollect = hasPermission(session.permissions, "fees.collect");

  const collectOptions = defaulters
    .map((row) => {
      const student = studentById.get(row.studentId);
      if (!student) return null;
      const enrollment = student.enrollments[0];
      return {
        id: student.id,
        label: `${student.firstName} ${student.lastName ?? ""} (${student.admissionNo})${
          enrollment ? ` · ${enrollment.section.classLevel.name} ${enrollment.section.name}` : ""
        }`,
        due: formatMoney(row._sum.amountDue, currency),
      };
    })
    .filter((option): option is NonNullable<typeof option> => option !== null);

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Fees"
        description={
          session.academicYear
            ? `Academic year ${session.academicYear.name}`
            : "No academic year is current"
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Billed"
          value={formatMoney(billed, currency)}
          sublabel={`${totals._count._all} invoices`}
        />
        <StatTile
          label="Collected"
          value={formatMoney(collected, currency)}
          sublabel={formatPercent(collectionRate, 1)}
          tone={collectionRate >= 75 ? "success" : "warning"}
        />
        <StatTile
          label="Outstanding"
          value={formatMoney(outstanding, currency)}
          sublabel={`${overdueAgg._count._all} overdue`}
          tone={outstanding > 0 ? "danger" : "success"}
        />
        <StatTile
          label="Collected today"
          value={formatMoney(collectedToday._sum.amount, currency)}
          sublabel={`${collectedToday._count._all} receipts`}
          tone="info"
        />
      </div>

      <div className="mt-4">
        <Card>
          <div className="px-5 py-4">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-muted">Collection progress</span>
              <span className="numeric font-semibold">
                {formatPercent(collectionRate, 1)}
              </span>
            </div>
            <ProgressBar
              value={collectionRate}
              tone={collectionRate >= 75 ? "success" : collectionRate >= 50 ? "warning" : "danger"}
            />
            <p className="mt-2 text-xs text-muted">
              {formatMoney(collected, currency)} of {formatMoney(billed, currency)} billed ·{" "}
              {formatMoney(toNumber(overdueAgg._sum.amountDue), currency)} of the
              outstanding balance is past its due date.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Invoices"
            description={`${total} matching`}
            action={
              <Link href="/fees/payments" className="text-xs font-medium text-brand">
                All payments
              </Link>
            }
          />
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            <SearchBox placeholder="Invoice no, student, admission no…" />
            <FilterSelect
              paramName="status"
              label="Status"
              allLabel="All statuses"
              options={Object.keys(STATUS_TONE).map((value) => ({
                value,
                label: value.replace("_", " ").toLowerCase(),
              }))}
            />
          </div>

          {invoices.length === 0 ? (
            <EmptyState title="No invoices match these filters" />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Student</Th>
                    <Th>Due</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Balance</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const overdue =
                      toNumber(invoice.amountDue) > 0 && invoice.dueDate < new Date();
                    return (
                      <tr key={invoice.id} className="hover:bg-surface-hover">
                        <Td>
                          <span className="font-mono text-xs">{invoice.invoiceNo}</span>
                          {invoice.period ? (
                            <span className="block text-xs text-muted">
                              {invoice.period}
                            </span>
                          ) : null}
                        </Td>
                        <Td>
                          <Link
                            href={`/students/${invoice.student.id}`}
                            className="font-medium hover:text-brand"
                          >
                            {invoice.student.firstName} {invoice.student.lastName}
                          </Link>
                          <span className="block font-mono text-[11px] text-muted">
                            {invoice.student.admissionNo}
                          </span>
                        </Td>
                        <Td className={overdue ? "text-danger" : "text-muted-strong"}>
                          {formatDate(invoice.dueDate)}
                        </Td>
                        <Td className="numeric text-right">
                          {formatMoney(invoice.total, currency)}
                        </Td>
                        <Td className="numeric text-right font-medium">
                          {formatMoney(invoice.amountDue, currency)}
                        </Td>
                        <Td>
                          <Badge tone={STATUS_TONE[invoice.status] ?? "neutral"}>
                            {invoice.status.replace("_", " ").toLowerCase()}
                          </Badge>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <div className="border-t border-border">
                <Pagination page={page} pageCount={pageCount} total={total} />
              </div>
            </>
          )}
        </Card>

        <div className="space-y-4">
          {canCollect ? (
            <Card>
              <CardHeader
                title="Collect payment"
                description="Record an offline or counter payment"
              />
              {collectOptions.length === 0 ? (
                <EmptyState
                  title="Nothing outstanding"
                  description="Every invoice in this year is settled."
                />
              ) : (
                <CollectForm students={collectOptions} />
              )}
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Top defaulters"
              description="Largest outstanding balances"
            />
            {defaulters.length === 0 ? (
              <EmptyState title="No outstanding balances" />
            ) : (
              <ul className="divide-y divide-border">
                {defaulters.slice(0, 8).map((row) => {
                  const student = studentById.get(row.studentId);
                  if (!student) return null;
                  const enrollment = student.enrollments[0];
                  return (
                    <li
                      key={row.studentId}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/students/${student.id}`}
                          className="block truncate text-sm font-medium hover:text-brand"
                        >
                          {student.firstName} {student.lastName}
                        </Link>
                        <span className="text-xs text-muted">
                          {enrollment
                            ? `${enrollment.section.classLevel.name} ${enrollment.section.name}`
                            : student.admissionNo}
                        </span>
                      </div>
                      <span className="numeric shrink-0 text-sm font-semibold text-danger">
                        {formatMoney(row._sum.amountDue, currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
