import Link from "next/link";
import { notFound } from "next/navigation";

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
import { PhotoUploader } from "@/components/photo-uploader";
import { Avatar } from "@/components/avatar";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  formatDate,
  formatMoney,
  formatPercent,
  toNumber,
} from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Student profile" };

const INVOICE_TONE: Record<string, Tone> = {
  PAID: "success",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  OVERDUE: "danger",
  CANCELLED: "neutral",
  DRAFT: "neutral",
  REFUNDED: "neutral",
  WRITTEN_OFF: "neutral",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{value ?? "—"}</dd>
    </div>
  );
}

export default async function StudentProfilePage({
  params,
}: PageProps<"/students/[id]">) {
  const session = await requirePermission("students.read");
  const db = scopedDb(session.schoolId);
  const { id } = await params;
  const yearId = session.academicYear?.id;
  const currency = session.school.currency;

  const student = await db.student.findUnique({
    where: { id },
    include: {
      guardians: { include: { guardian: true } },
      enrollments: {
        orderBy: { enrolledOn: "desc" },
        include: {
          section: {
            select: {
              name: true,
              classLevel: { select: { name: true } },
              classTeacher: { select: { firstName: true, lastName: true } },
            },
          },
          academicYear: { select: { name: true } },
        },
      },
      transportAssignments: {
        where: { isActive: true },
        take: 1,
        include: {
          route: { select: { id: true, name: true } },
          stop: { select: { name: true, pickupTime: true } },
        },
      },
      hostelAllocations: {
        where: { isActive: true },
        take: 1,
        include: {
          room: {
            select: { roomNumber: true, hostel: { select: { name: true } } },
          },
        },
      },
      documents: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });

  if (!student) notFound();

  const [attendanceGroups, invoiceTotals, invoices, marks, bookIssues, payments, reportCards] =
    await Promise.all([
      db.attendanceRecord.groupBy({
        by: ["status"],
        where: { studentId: student.id, ...(yearId ? { academicYearId: yearId } : {}) },
        _count: { _all: true },
      }),
      db.invoice.aggregate({
        where: { studentId: student.id, ...(yearId ? { academicYearId: yearId } : {}) },
        _sum: { total: true, amountPaid: true, amountDue: true },
      }),
      db.invoice.findMany({
        where: { studentId: student.id },
        orderBy: { dueDate: "desc" },
        take: 6,
        select: {
          id: true, invoiceNo: true, period: true, dueDate: true,
          total: true, amountDue: true, status: true,
        },
      }),
      db.markEntry.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          subject: { select: { name: true } },
          exam: { select: { name: true, maxMarks: true, term: { select: { name: true } } } },
        },
      }),
      db.bookIssue.findMany({
        where: { studentId: student.id, returnedOn: null },
        include: { copy: { include: { book: { select: { title: true } } } } },
      }),
      db.payment.findMany({
        where: { studentId: student.id, status: "SUCCESS" },
        orderBy: { paidAt: "desc" },
        take: 6,
        select: { id: true, receiptNo: true, amount: true, mode: true, paidAt: true },
      }),
      db.reportCard.findMany({
        where: { studentId: student.id },
        orderBy: { term: { sequence: "asc" } },
        select: {
          id: true,
          percentage: true,
          grade: true,
          rank: true,
          result: true,
          isPublished: true,
          term: { select: { name: true } },
        },
      }),
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

  const outstanding = toNumber(invoiceTotals._sum.amountDue);
  const billed = toNumber(invoiceTotals._sum.total);
  const paid = toNumber(invoiceTotals._sum.amountPaid);

  const currentEnrollment = student.enrollments.find(
    (enrollment) => !yearId || enrollment.academicYearId === yearId,
  );
  const transport = student.transportAssignments[0];
  // Prefer a published card for the link; fall back to the latest draft so
  // staff can still reach a card they have generated but not yet published.
  const publishedCard =
    reportCards.find((card) => card.isPublished) ?? reportCards.at(-1) ?? null;
  const canEditPhoto = hasPermission(session.permissions, "students.update");
  const hostel = student.hostelAllocations[0];

  const averageMark =
    marks.length > 0
      ? marks.reduce(
          (sum, mark) =>
            sum + (toNumber(mark.marksObtained) / toNumber(mark.exam.maxMarks)) * 100,
          0,
        ) / marks.length
      : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar
              firstName={student.firstName}
              lastName={student.lastName}
              photoUrl={student.photoUrl}
              size="lg"
            />
            {student.firstName} {student.middleName} {student.lastName}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{student.admissionNo}</span>
            {currentEnrollment ? (
              <>
                <span>·</span>
                <span>
                  {currentEnrollment.section.classLevel.name}{" "}
                  {currentEnrollment.section.name}
                </span>
              </>
            ) : null}
            <Badge tone={student.status === "ACTIVE" ? "success" : "warning"}>
              {student.status.replace("_", " ").toLowerCase()}
            </Badge>
          </span>
        }
        action={
          <span className="flex items-center gap-2">
            {canEditPhoto ? (
              <Link
                href={`/students/${student.id}/edit`}
                className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
              >
                Edit / promote
              </Link>
            ) : null}
            <Link
              href="/students"
              className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
            >
              Back to list
            </Link>
          </span>
        }
      />

      {attendanceRate !== null && attendanceRate < 75 ? (
        <div className="mb-4">
          <Alert tone="warning" title="Attendance below the 75% threshold">
            This student has attended {formatPercent(attendanceRate, 1)} of
            recorded sessions this year. Many boards require 75% to sit
            examinations.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Attendance"
          value={attendanceRate === null ? "—" : formatPercent(attendanceRate, 1)}
          sublabel={`${attendancePresent} of ${attendanceTotal} sessions`}
          tone={
            attendanceRate === null ? "neutral"
            : attendanceRate >= 90 ? "success"
            : attendanceRate >= 75 ? "warning"
            : "danger"
          }
          href={`/students/${student.id}/attendance`}
        />
        <StatTile
          label="Average score"
          value={averageMark === null ? "—" : formatPercent(averageMark, 1)}
          sublabel={`${marks.length} recent assessments`}
          href={publishedCard ? `/exams/report-cards/${publishedCard.id}` : "/exams"}
          tone={
            averageMark === null ? "neutral"
            : averageMark >= 75 ? "success"
            : averageMark >= 50 ? "warning"
            : "danger"
          }
        />
        <StatTile
          label="Fees outstanding"
          value={formatMoney(outstanding, currency)}
          sublabel={outstanding > 0 ? "Payment due" : "All settled"}
          tone={outstanding > 0 ? "danger" : "success"}
          href={`/fees/payments?q=${encodeURIComponent(student.admissionNo)}`}
        />
        <StatTile
          label="Library"
          value={String(bookIssues.length)}
          sublabel={bookIssues.length === 1 ? "book on loan" : "books on loan"}
          tone={bookIssues.some((issue) => issue.dueOn < new Date()) ? "danger" : "neutral"}
          href="/library"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Personal details" />
          <div className="flex justify-center border-b border-border py-4">
            <PhotoUploader
              subject="student"
              recordId={student.id}
              firstName={student.firstName}
              lastName={student.lastName}
              photoUrl={student.photoUrl}
              canEdit={canEditPhoto}
            />
          </div>
          <dl className="px-5 py-2">
            <DetailRow label="Date of birth" value={formatDate(student.dateOfBirth, "long")} />
            <DetailRow label="Gender" value={student.gender?.toLowerCase()} />
            <DetailRow label="Blood group" value={student.bloodGroup} />
            <DetailRow label="Category" value={student.category} />
            <DetailRow label="Nationality" value={student.nationality} />
            <DetailRow label="Admitted on" value={formatDate(student.admissionDate)} />
            <DetailRow
              label="Address"
              value={
                [student.addressLine1, student.city, student.state, student.postalCode]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Guardians" description="Contacts on record" />
          {student.guardians.length === 0 ? (
            <EmptyState title="No guardian linked" />
          ) : (
            <ul className="divide-y divide-border">
              {student.guardians.map((link) => (
                <li key={link.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {link.guardian.firstName} {link.guardian.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {link.relationship.toLowerCase()} · {link.guardian.phone}
                      </p>
                      {link.guardian.occupation ? (
                        <p className="text-xs text-muted">{link.guardian.occupation}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {link.isPrimary ? <Badge tone="brand">Primary</Badge> : null}
                      {link.isFeePayer ? <Badge tone="info">Fee payer</Badge> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Services" description="Transport, hostel and enrolment" />
          <dl className="px-5 py-2">
            <DetailRow
              label="Class teacher"
              value={
                currentEnrollment?.section.classTeacher
                  ? `${currentEnrollment.section.classTeacher.firstName} ${currentEnrollment.section.classTeacher.lastName ?? ""}`
                  : "—"
              }
            />
            <DetailRow label="Roll number" value={currentEnrollment?.rollNumber} />
            <DetailRow
              label="Transport"
              value={
                transport ? (
                  <Link
                    href={`/transport/routes/${transport.route.id}`}
                    className="hover:text-brand"
                  >
                    {transport.route.name}
                    <span className="block text-xs font-normal text-muted">
                      {transport.stop.name}
                      {transport.stop.pickupTime
                        ? ` · pickup ${transport.stop.pickupTime}`
                        : ""}
                    </span>
                  </Link>
                ) : (
                  "Not availed"
                )
              }
            />
            <DetailRow
              label="Hostel"
              value={
                hostel ? (
                  <Link href="/hostel" className="hover:text-brand">
                    {hostel.room.hostel.name}
                    <span className="block text-xs font-normal text-muted">
                      Room {hostel.room.roomNumber}
                      {hostel.bedNumber ? ` · bed ${hostel.bedNumber}` : ""}
                    </span>
                  </Link>
                ) : (
                  "Day scholar"
                )
              }
            />
            <DetailRow label="Documents on file" value={String(student.documents.length)} />
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Fee history"
            description={`${formatMoney(paid, currency)} paid of ${formatMoney(billed, currency)} billed`}
            action={
              <Link
                href={`/fees/payments?q=${encodeURIComponent(student.admissionNo)}`}
                className="text-xs font-medium text-brand"
              >
                All payments
              </Link>
            }
          />
          <div className="px-5 pt-4">
            <ProgressBar
              value={billed > 0 ? (paid / billed) * 100 : 0}
              tone={outstanding > 0 ? "warning" : "success"}
            />
          </div>
          {invoices.length === 0 ? (
            <EmptyState title="No invoices raised" />
          ) : (
            <Table className="mt-3">
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Due amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <Td>
                      <span className="font-mono text-xs">{invoice.invoiceNo}</span>
                      {invoice.period ? (
                        <span className="block text-xs text-muted">{invoice.period}</span>
                      ) : null}
                    </Td>
                    <Td className="text-muted-strong">{formatDate(invoice.dueDate)}</Td>
                    <Td className="numeric text-right">
                      {formatMoney(invoice.total, currency)}
                    </Td>
                    <Td className="numeric text-right font-medium">
                      {formatMoney(invoice.amountDue, currency)}
                    </Td>
                    <Td>
                      <Badge tone={INVOICE_TONE[invoice.status] ?? "neutral"}>
                        {invoice.status.replace("_", " ").toLowerCase()}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent assessment results" />
          {marks.length === 0 ? (
            <EmptyState title="No marks recorded yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Subject</Th>
                  <Th>Assessment</Th>
                  <Th className="text-right">Score</Th>
                  <Th className="text-right">%</Th>
                </tr>
              </thead>
              <tbody>
                {marks.map((mark) => {
                  const max = toNumber(mark.exam.maxMarks);
                  const obtained = toNumber(mark.marksObtained);
                  const percent = max > 0 ? (obtained / max) * 100 : 0;
                  return (
                    <tr key={mark.id}>
                      <Td className="font-medium">{mark.subject.name}</Td>
                      <Td className="text-muted-strong">{mark.exam.term.name}</Td>
                      <Td className="numeric text-right">
                        {mark.isAbsent ? "AB" : `${obtained} / ${max}`}
                      </Td>
                      <Td className="text-right">
                        <Badge
                          tone={
                            percent >= 75 ? "success"
                            : percent >= 50 ? "warning"
                            : "danger"
                          }
                        >
                          {formatPercent(percent, 0)}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Receipts"
            description="Payments received from this student"
          />
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Receipt</Th>
                  <Th>Date</Th>
                  <Th>Mode</Th>
                  <Th className="text-right">Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-surface-hover">
                    <Td className="font-mono text-xs">{payment.receiptNo}</Td>
                    <Td className="text-muted-strong">{formatDate(payment.paidAt)}</Td>
                    <Td>
                      <Badge tone="neutral">
                        {payment.mode.replace("_", " ").toLowerCase()}
                      </Badge>
                    </Td>
                    <Td className="numeric text-right font-medium">
                      {formatMoney(payment.amount, currency)}
                    </Td>
                    <Td className="text-right">
                      <Link
                        href={`/fees/payments/${payment.id}`}
                        className="text-xs font-medium text-brand"
                      >
                        Receipt
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Report cards"
            description="Drafts are visible to staff only"
          />
          {reportCards.length === 0 ? (
            <EmptyState
              title="No report cards generated"
              description="Generate them from the examinations module."
              action={
                <Link
                  href="/exams/report-cards"
                  className="text-xs font-medium text-brand"
                >
                  Go to report cards
                </Link>
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Term</Th>
                  <Th className="text-right">%</Th>
                  <Th>Grade</Th>
                  <Th className="text-right">Rank</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {reportCards.map((card) => (
                  <tr key={card.id} className="hover:bg-surface-hover">
                    <Td className="font-medium">{card.term.name}</Td>
                    <Td className="numeric text-right">
                      {formatPercent(toNumber(card.percentage), 1)}
                    </Td>
                    <Td>
                      <Badge tone="brand">{card.grade ?? "—"}</Badge>
                    </Td>
                    <Td className="numeric text-right">{card.rank ?? "—"}</Td>
                    <Td>
                      <Badge tone={card.isPublished ? "success" : "warning"}>
                        {card.isPublished ? "published" : "draft"}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <Link
                        href={`/exams/report-cards/${card.id}`}
                        className="text-xs font-medium text-brand"
                      >
                        Open
                      </Link>
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
