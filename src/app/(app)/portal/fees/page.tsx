import { ChildSwitcher } from "@/app/(app)/portal/child-switcher";
import {
  Alert,
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
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Fees" };

const STATUS_TONE: Record<string, Tone> = {
  PAID: "success",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  OVERDUE: "danger",
  CANCELLED: "neutral",
  DRAFT: "neutral",
  REFUNDED: "neutral",
  WRITTEN_OFF: "neutral",
};

export default async function PortalFeesPage({
  searchParams,
}: PageProps<"/portal/fees">) {
  const params = await searchParams;
  const { context, child } = await resolvePortalStudent(params.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);
  const currency = session.school.currency;
  const yearId = session.academicYear?.id;

  const [totals, invoices, payments] = await Promise.all([
    db.invoice.aggregate({
      where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
      _sum: { total: true, amountPaid: true, amountDue: true },
    }),
    db.invoice.findMany({
      where: {
        studentId: child.id,
        // Drafts are internal to the school office and are not shown.
        status: { not: "DRAFT" },
      },
      orderBy: { dueDate: "desc" },
      include: {
        lines: {
          select: { id: true, description: true, lineTotal: true },
          orderBy: { description: "asc" },
        },
      },
    }),
    db.payment.findMany({
      where: { studentId: child.id, status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      take: 12,
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        mode: true,
        paidAt: true,
        transactionRef: true,
      },
    }),
  ]);

  const billed = toNumber(totals._sum.total);
  const paid = toNumber(totals._sum.amountPaid);
  const outstanding = toNumber(totals._sum.amountDue);

  const overdue = invoices.filter(
    (invoice) => toNumber(invoice.amountDue) > 0 && invoice.dueDate < new Date(),
  );

  return (
    <>
      <PageHeader
        title="Fees"
        description={`${child.firstName} ${child.lastName ?? ""} · ${child.className ?? child.admissionNo}`}
      />

      <ChildSwitcher students={context.children} selectedId={child.id} />

      {overdue.length > 0 ? (
        <div className="mb-4">
          <Alert tone="danger" title="Payment overdue">
            {overdue.length} invoice{overdue.length === 1 ? " is" : "s are"} past
            the due date, totalling{" "}
            {formatMoney(
              overdue.reduce((sum, invoice) => sum + toNumber(invoice.amountDue), 0),
              currency,
            )}
            . Please contact the school office to settle.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Total billed" value={formatMoney(billed, currency)} />
        <StatTile label="Paid" value={formatMoney(paid, currency)} tone="success" />
        <StatTile
          label="Outstanding"
          value={formatMoney(outstanding, currency)}
          sublabel={outstanding > 0 ? "payment pending" : "all settled"}
          tone={outstanding > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="mt-4">
        <div className="px-5 py-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Payment progress</span>
            <span className="numeric font-semibold">
              {billed > 0 ? `${((paid / billed) * 100).toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar
              value={billed > 0 ? (paid / billed) * 100 : 0}
              tone={outstanding > 0 ? "warning" : "success"}
            />
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Invoices" description="Fee demands raised for this student" />
        {invoices.length === 0 ? (
          <EmptyState title="No invoices raised yet" />
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {invoice.period ?? "Fee invoice"}
                      <span className="ml-2 font-mono text-[11px] text-muted">
                        {invoice.invoiceNo}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Issued {formatDate(invoice.issueDate)} · due{" "}
                      {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="numeric text-sm font-semibold">
                      {formatMoney(invoice.total, currency)}
                    </p>
                    <Badge tone={STATUS_TONE[invoice.status] ?? "neutral"}>
                      {invoice.status.replace("_", " ").toLowerCase()}
                    </Badge>
                  </div>
                </div>

                {invoice.lines.length > 0 ? (
                  <dl className="mt-3 space-y-1 border-t border-border pt-3">
                    {invoice.lines.map((line) => (
                      <div key={line.id} className="flex justify-between text-xs">
                        <dt className="text-muted">{line.description}</dt>
                        <dd className="numeric text-muted-strong">
                          {formatMoney(line.lineTotal, currency)}
                        </dd>
                      </div>
                    ))}
                    {toNumber(invoice.amountDue) > 0 ? (
                      <div className="flex justify-between border-t border-border pt-1.5 text-xs font-semibold">
                        <dt>Balance due</dt>
                        <dd className="numeric text-danger">
                          {formatMoney(invoice.amountDue, currency)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Payment history" description="Receipts issued to date" />
        {payments.length === 0 ? (
          <EmptyState title="No payments recorded" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Date</Th>
                <Th>Mode</Th>
                <Th>Reference</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <Td className="font-mono text-xs">{payment.receiptNo}</Td>
                  <Td className="text-muted-strong">{formatDate(payment.paidAt)}</Td>
                  <Td>
                    <Badge tone="neutral">{payment.mode.replace("_", " ").toLowerCase()}</Badge>
                  </Td>
                  <Td className="font-mono text-[11px] text-muted">
                    {payment.transactionRef ?? "—"}
                  </Td>
                  <Td className="numeric text-right font-medium">
                    {formatMoney(payment.amount, currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        Online payment is not enabled on this deployment yet. Please pay at the
        school office, and receipts will appear here.
      </p>
    </>
  );
}
