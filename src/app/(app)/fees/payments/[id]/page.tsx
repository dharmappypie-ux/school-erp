import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/(app)/exams/report-cards/[id]/print-button";
import { Badge, Card, Td, Th, type Tone } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Receipt" };

const STATUS_TONE: Record<string, Tone> = {
  SUCCESS: "success",
  PENDING: "warning",
  FAILED: "danger",
  REFUNDED: "neutral",
  CANCELLED: "neutral",
  BOUNCED: "danger",
};

/** Words for the amount, as Indian receipts are expected to carry. */
function amountInWords(value: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ];

  function underThousand(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) {
      return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
    }
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${underThousand(n % 100)}` : ""}`;
  }

  const whole = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - whole) * 100);
  if (whole === 0 && paise === 0) return "Zero Rupees Only";

  // Indian grouping: crore, lakh, thousand, then the remainder.
  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;

  const parts = [
    crore ? `${underThousand(crore)} Crore` : "",
    lakh ? `${underThousand(lakh)} Lakh` : "",
    thousand ? `${underThousand(thousand)} Thousand` : "",
    rest ? underThousand(rest) : "",
  ].filter(Boolean);

  const rupees = parts.join(" ");
  return paise > 0
    ? `${rupees} Rupees and ${underThousand(paise)} Paise Only`
    : `${rupees} Rupees Only`;
}

export default async function ReceiptPage({
  params,
}: PageProps<"/fees/payments/[id]">) {
  const session = await requirePermission("fees.read");
  const db = scopedDb(session.schoolId);
  const { id } = await params;
  const currency = session.school.currency;

  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          admissionNo: true,
          enrollments: {
            take: 1,
            orderBy: { enrolledOn: "desc" },
            select: {
              rollNumber: true,
              section: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
        },
      },
      allocations: {
        include: {
          invoice: {
            select: {
              invoiceNo: true,
              period: true,
              total: true,
              amountDue: true,
              lines: {
                select: { id: true, description: true, lineTotal: true },
                orderBy: { description: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!payment) notFound();

  const enrollment = payment.student.enrollments[0];
  const amount = toNumber(payment.amount);
  const refunded = toNumber(payment.refundedAmount);

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/fees/payments"
          className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
        >
          Back to payments
        </Link>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[payment.status] ?? "neutral"}>
            {payment.status.toLowerCase()}
          </Badge>
          <PrintButton />
        </div>
      </div>

      <Card className="mx-auto max-w-3xl px-8 py-8 print:border-0 print:shadow-none">
        <header className="border-b-2 border-foreground pb-4 text-center">
          <h1 className="text-xl font-bold tracking-tight">{session.school.name}</h1>
          <p className="mt-0.5 text-xs text-muted">Fee Receipt</p>
        </header>

        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[11px] text-muted uppercase">Receipt no.</dt>
            <dd className="font-mono font-semibold">{payment.receiptNo}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Date</dt>
            <dd>{formatDate(payment.paidAt, "long")}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Mode</dt>
            <dd className="capitalize">
              {payment.mode.replace("_", " ").toLowerCase()}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Student</dt>
            <dd className="font-semibold">
              {[
                payment.student.firstName,
                payment.student.middleName,
                payment.student.lastName,
              ]
                .filter(Boolean)
                .join(" ")}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Admission no.</dt>
            <dd className="font-mono">{payment.student.admissionNo}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Class</dt>
            <dd>
              {enrollment
                ? `${enrollment.section.classLevel.name} ${enrollment.section.name}`
                : "—"}
              {enrollment?.rollNumber ? ` · Roll ${enrollment.rollNumber}` : ""}
            </dd>
          </div>
        </dl>

        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold tracking-wide uppercase">
            Applied to
          </h2>
          {payment.allocations.length === 0 ? (
            <p className="text-sm text-muted">
              Not applied to a specific invoice — held as an advance.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Period</Th>
                  <Th className="text-right">Invoice total</Th>
                  <Th className="text-right">Applied</Th>
                  <Th className="text-right">Balance after</Th>
                </tr>
              </thead>
              <tbody>
                {payment.allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <Td className="font-mono text-xs">
                      {allocation.invoice.invoiceNo}
                    </Td>
                    <Td className="text-muted-strong">
                      {allocation.invoice.period ?? "—"}
                    </Td>
                    <Td className="numeric text-right">
                      {formatMoney(allocation.invoice.total, currency)}
                    </Td>
                    <Td className="numeric text-right font-medium">
                      {formatMoney(allocation.amount, currency)}
                    </Td>
                    <Td className="numeric text-right">
                      {formatMoney(allocation.invoice.amountDue, currency)}
                    </Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-foreground">
                  <Td className="font-semibold" colSpan={3}>
                    Total received
                  </Td>
                  <Td className="numeric text-right font-semibold">
                    {formatMoney(amount, currency)}
                  </Td>
                  <Td />
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <p className="mt-4 text-sm">
          <span className="text-[11px] text-muted uppercase">Amount in words: </span>
          <span className="font-medium">{amountInWords(amount)}</span>
        </p>

        {refunded > 0 ? (
          <p className="mt-2 text-sm text-danger">
            {formatMoney(refunded, currency)} of this receipt was refunded
            {payment.refundedAt ? ` on ${formatDate(payment.refundedAt)}` : ""}.
            {payment.refundReason ? ` Reason: ${payment.refundReason}` : ""}
          </p>
        ) : null}

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs sm:grid-cols-4">
          {payment.transactionRef ? (
            <div>
              <dt className="text-[11px] text-muted uppercase">Reference</dt>
              <dd className="font-mono">{payment.transactionRef}</dd>
            </div>
          ) : null}
          {payment.gateway ? (
            <div>
              <dt className="text-[11px] text-muted uppercase">Gateway</dt>
              <dd>{payment.gateway}</dd>
            </div>
          ) : null}
          {payment.chequeNumber ? (
            <div>
              <dt className="text-[11px] text-muted uppercase">Cheque</dt>
              <dd className="font-mono">{payment.chequeNumber}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[11px] text-muted uppercase">Recorded</dt>
            <dd>{formatDateTime(payment.createdAt)}</dd>
          </div>
        </dl>

        {payment.remarks ? (
          <p className="mt-3 text-xs text-muted">{payment.remarks}</p>
        ) : null}

        <footer className="mt-12 grid grid-cols-2 gap-6 text-center text-[11px] text-muted">
          {["Received by", "Authorised signatory"].map((role) => (
            <div key={role}>
              <div className="mb-1 border-t border-foreground" />
              {role}
            </div>
          ))}
        </footer>

        <p className="mt-6 text-center text-[10px] text-muted">
          This is a computer-generated receipt. Please retain it for your records.
        </p>
      </Card>
    </>
  );
}
