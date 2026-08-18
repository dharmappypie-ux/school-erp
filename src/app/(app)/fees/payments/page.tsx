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
import { formatDate, formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Payments" };

const PAGE_SIZE = 30;

const STATUS_TONE: Record<string, Tone> = {
  SUCCESS: "success",
  PENDING: "warning",
  PROCESSING: "info",
  FAILED: "danger",
  REFUNDED: "neutral",
  CANCELLED: "neutral",
  BOUNCED: "danger",
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

export default async function PaymentsPage({
  searchParams,
}: PageProps<"/fees/payments">) {
  const session = await requirePermission("fees.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const currency = session.school.currency;

  const query = typeof params.q === "string" ? params.q.trim() : "";
  const mode = typeof params.mode === "string" ? params.mode : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.PaymentWhereInput = {
    ...(mode ? { mode: mode as Prisma.EnumPaymentModeFilter["equals"] } : {}),
    ...(query
      ? {
          OR: [
            { receiptNo: { contains: query, mode: "insensitive" } },
            { transactionRef: { contains: query, mode: "insensitive" } },
            { student: { firstName: { contains: query, mode: "insensitive" } } },
            { student: { lastName: { contains: query, mode: "insensitive" } } },
            { student: { admissionNo: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, payments, todayTotals, modeTotals] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        mode: true,
        status: true,
        paidAt: true,
        transactionRef: true,
        gateway: true,
        refundedAmount: true,
        student: {
          select: { id: true, firstName: true, lastName: true, admissionNo: true },
        },
        allocations: { select: { invoice: { select: { invoiceNo: true } } } },
      },
    }),
    db.payment.aggregate({
      // Bounded on both sides: an open-ended `gte` would also count payments
      // dated in the future.
      where: {
        status: "SUCCESS",
        paidAt: { gte: startOfToday(), lt: startOfTomorrow() },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.payment.groupBy({
      by: ["mode"],
      where: { status: "SUCCESS" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const collectedAll = modeTotals.reduce(
    (sum, row) => sum + toNumber(row._sum.amount),
    0,
  );
  const topMode = [...modeTotals].sort(
    (a, b) => toNumber(b._sum.amount) - toNumber(a._sum.amount),
  )[0];

  return (
    <>
      <PageHeader
        title="Payments"
        description={`${total} matching ${total === 1 ? "receipt" : "receipts"}`}
        action={
          <Link
            href="/fees"
            className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
          >
            Back to fees
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Collected today"
          value={formatMoney(todayTotals._sum.amount, currency)}
          sublabel={`${todayTotals._count._all} receipts`}
          tone="info"
        />
        <StatTile
          label="Collected all time"
          value={formatMoney(collectedAll, currency)}
          sublabel={`${modeTotals.reduce((sum, row) => sum + row._count._all, 0)} receipts`}
          tone="success"
        />
        <StatTile
          label="Most used mode"
          value={topMode ? topMode.mode.replace("_", " ").toLowerCase() : "—"}
          sublabel={
            topMode ? formatMoney(topMode._sum.amount, currency) : "no payments yet"
          }
        />
        <StatTile
          label="Payment modes"
          value={String(modeTotals.length)}
          sublabel="in use"
        />
      </div>

      <Card className="mt-4">
        <CardHeader title="Receipts" description="Most recent first" />
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <SearchBox placeholder="Receipt no, reference, student…" />
          <FilterSelect
            paramName="mode"
            label="Mode"
            allLabel="All modes"
            options={modeTotals.map((row) => ({
              value: row.mode,
              label: row.mode.replace("_", " ").toLowerCase(),
            }))}
          />
        </div>

        {payments.length === 0 ? (
          <EmptyState title="No payments match these filters" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Receipt</Th>
                  <Th>Student</Th>
                  <Th>Applied to</Th>
                  <Th>Mode</Th>
                  <Th>Received</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-surface-hover">
                    <Td>
                      <span className="font-mono text-xs font-medium">
                        {payment.receiptNo}
                      </span>
                      {payment.transactionRef ? (
                        <span className="block font-mono text-[11px] text-muted">
                          {payment.transactionRef}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Link
                        href={`/students/${payment.student.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {payment.student.firstName} {payment.student.lastName}
                      </Link>
                      <span className="block font-mono text-[11px] text-muted">
                        {payment.student.admissionNo}
                      </span>
                    </Td>
                    <Td className="text-muted-strong">
                      {payment.allocations.length === 0 ? (
                        <span className="text-muted">unallocated</span>
                      ) : (
                        <span className="font-mono text-[11px]">
                          {payment.allocations
                            .map((allocation) => allocation.invoice.invoiceNo)
                            .join(", ")}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone="neutral">
                        {payment.mode.replace("_", " ").toLowerCase()}
                      </Badge>
                      {payment.gateway ? (
                        <span className="block text-[11px] text-muted">
                          {payment.gateway}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-muted-strong">
                      {formatDate(payment.paidAt)}
                      <span className="block text-[11px] text-muted">
                        {formatDateTime(payment.paidAt).split(", ").pop()}
                      </span>
                    </Td>
                    <Td className="numeric text-right font-medium">
                      {formatMoney(payment.amount, currency)}
                      {toNumber(payment.refundedAmount) > 0 ? (
                        <span className="block text-[11px] text-danger">
                          −{formatMoney(payment.refundedAmount, currency)} refunded
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[payment.status] ?? "neutral"}>
                        {payment.status.toLowerCase()}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-border">
              <Pagination
                page={page}
                pageCount={Math.ceil(total / PAGE_SIZE)}
                total={total}
              />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
