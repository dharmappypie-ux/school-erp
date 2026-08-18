import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/(app)/exams/report-cards/[id]/print-button";
import { Badge, Card, Td, Th, type Tone } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatPercent, toNumber } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Report card" };

const RESULT_TONE: Record<string, Tone> = {
  PASS: "success",
  FAIL: "danger",
  ABSENT: "warning",
};

export default async function ReportCardPage({
  params,
}: PageProps<"/exams/report-cards/[id]">) {
  const session = await requirePermission("reportcards.read");
  const db = scopedDb(session.schoolId);
  const { id } = await params;

  const card = await db.reportCard.findUnique({
    where: { id },
    include: {
      term: { select: { name: true } },
      academicYear: { select: { name: true } },
      lines: {
        orderBy: { subject: { name: "asc" } },
        include: { subject: { select: { name: true, code: true, isCoScholastic: true } } },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          admissionNo: true,
          dateOfBirth: true,
          enrollments: {
            take: 1,
            orderBy: { enrolledOn: "desc" },
            select: {
              rollNumber: true,
              section: {
                select: {
                  name: true,
                  classLevel: { select: { name: true } },
                  classTeacher: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!card) notFound();

  const enrollment = card.student.enrollments[0];
  const scholastic = card.lines.filter((line) => !line.subject.isCoScholastic);
  const coScholastic = card.lines.filter((line) => line.subject.isCoScholastic);

  const attendancePercent =
    card.attendanceTotal && card.attendanceTotal > 0
      ? ((card.attendancePresent ?? 0) / card.attendanceTotal) * 100
      : null;

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/exams/report-cards"
          className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
        >
          Back to report cards
        </Link>
        <div className="flex items-center gap-2">
          {card.isPublished ? (
            <Badge tone="success">Published {formatDate(card.publishedAt)}</Badge>
          ) : (
            <Badge tone="warning">Draft — not visible to parents</Badge>
          )}
          <PrintButton />
        </div>
      </div>

      <Card className="mx-auto max-w-3xl px-8 py-8 print:border-0 print:shadow-none">
        {/* Letterhead */}
        <header className="border-b-2 border-foreground pb-4 text-center">
          <h1 className="text-xl font-bold tracking-tight">{session.school.name}</h1>
          <p className="mt-0.5 text-xs text-muted">
            Report Card · {card.term.name} · Academic Year {card.academicYear.name}
          </p>
        </header>

        {/* Student particulars */}
        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[11px] text-muted uppercase">Student</dt>
            <dd className="font-semibold">
              {[card.student.firstName, card.student.middleName, card.student.lastName]
                .filter(Boolean)
                .join(" ")}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Admission no.</dt>
            <dd className="font-mono">{card.student.admissionNo}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Class</dt>
            <dd>
              {enrollment
                ? `${enrollment.section.classLevel.name} ${enrollment.section.name}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Roll no.</dt>
            <dd className="numeric">{enrollment?.rollNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Date of birth</dt>
            <dd>{formatDate(card.student.dateOfBirth)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Class teacher</dt>
            <dd>
              {enrollment?.section.classTeacher
                ? `${enrollment.section.classTeacher.firstName} ${enrollment.section.classTeacher.lastName ?? ""}`
                : "—"}
            </dd>
          </div>
        </dl>

        {/* Scholastic areas */}
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold tracking-wide uppercase">
            Scholastic areas
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Subject</Th>
                <Th className="text-right">Max</Th>
                <Th className="text-right">Obtained</Th>
                <Th className="text-right">%</Th>
                <Th className="text-center">Grade</Th>
                <Th>Remark</Th>
              </tr>
            </thead>
            <tbody>
              {scholastic.map((line) => (
                <tr key={line.id}>
                  <Td className="font-medium">{line.subject.name}</Td>
                  <Td className="numeric text-right">{toNumber(line.maxMarks)}</Td>
                  <Td className="numeric text-right">
                    {line.obtainedMarks === null ? "AB" : toNumber(line.obtainedMarks)}
                  </Td>
                  <Td className="numeric text-right">
                    {line.percentage === null
                      ? "—"
                      : formatPercent(toNumber(line.percentage), 1)}
                  </Td>
                  <Td className="text-center font-semibold">{line.grade ?? "—"}</Td>
                  <Td className="text-xs text-muted">{line.remarks ?? "—"}</Td>
                </tr>
              ))}
              <tr className="border-t-2 border-foreground">
                <Td className="font-semibold">Total</Td>
                <Td className="numeric text-right font-semibold">
                  {toNumber(card.totalMarks)}
                </Td>
                <Td className="numeric text-right font-semibold">
                  {toNumber(card.obtainedMarks)}
                </Td>
                <Td className="numeric text-right font-semibold">
                  {formatPercent(toNumber(card.percentage), 2)}
                </Td>
                <Td className="text-center font-semibold">{card.grade ?? "—"}</Td>
                <Td />
              </tr>
            </tbody>
          </table>
        </section>

        {coScholastic.length > 0 ? (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold tracking-wide uppercase">
              Co-scholastic areas
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Area</Th>
                  <Th className="text-center">Grade</Th>
                </tr>
              </thead>
              <tbody>
                {coScholastic.map((line) => (
                  <tr key={line.id}>
                    <Td>{line.subject.name}</Td>
                    <Td className="text-center font-semibold">{line.grade ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-[11px] text-muted">
              Co-scholastic areas are graded separately and do not count toward
              the overall percentage.
            </p>
          </section>
        ) : null}

        {/* Summary */}
        <section className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-muted uppercase">Percentage</p>
            <p className="numeric text-lg font-semibold">
              {formatPercent(toNumber(card.percentage), 2)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted uppercase">Grade / GPA</p>
            <p className="text-lg font-semibold">
              {card.grade ?? "—"}
              {card.gpa !== null ? (
                <span className="numeric ml-1 text-sm text-muted">
                  ({toNumber(card.gpa).toFixed(2)})
                </span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted uppercase">Class rank</p>
            <p className="numeric text-lg font-semibold">{card.rank ?? "—"}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted uppercase">Attendance</p>
            <p className="numeric text-lg font-semibold">
              {attendancePercent === null ? "—" : formatPercent(attendancePercent, 1)}
            </p>
            {card.attendanceTotal ? (
              <p className="text-[11px] text-muted">
                {card.attendancePresent} / {card.attendanceTotal} sessions
              </p>
            ) : null}
          </div>
        </section>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] text-muted uppercase">Result</span>
          <Badge tone={RESULT_TONE[card.result ?? ""] ?? "neutral"}>
            {card.result ?? "—"}
          </Badge>
        </div>

        {card.remarks ? (
          <section className="mt-5 border-t border-border pt-4">
            <p className="text-[11px] text-muted uppercase">Remarks</p>
            <p className="mt-1 text-sm">{card.remarks}</p>
          </section>
        ) : null}

        {/* Signatures */}
        <footer className="mt-12 grid grid-cols-3 gap-6 text-center text-[11px] text-muted">
          {["Class Teacher", "Principal", "Parent / Guardian"].map((role) => (
            <div key={role}>
              <div className="mb-1 border-t border-foreground" />
              {role}
            </div>
          ))}
        </footer>
      </Card>
    </>
  );
}
