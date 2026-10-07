import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, resolveMobileSession } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/me/snapshot
 *
 * The sync "pull": the signed-in parent/student's child summarised into the
 * exact shapes the mobile app's local database expects (student card,
 * invoices, notices). Everything is tenant-scoped and limited to the viewer's
 * own child — a guardian only ever sees students they are linked to.
 */
export async function GET(req: Request) {
  const session = await resolveMobileSession(req);
  if (!session) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  // Resolve which child this account is about.
  let studentId = session.studentId;
  if (!studentId && session.guardianId) {
    const link = await db.studentGuardian.findFirst({
      where: { guardianId: session.guardianId },
      orderBy: { isPrimary: "desc" },
      select: { studentId: true },
    });
    studentId = link?.studentId ?? null;
  }

  const empty = { student: null, invoices: [], notices: [] };
  if (!studentId) return cors(NextResponse.json(empty));

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: {
        where: yearId ? { academicYearId: yearId } : undefined,
        take: 1,
        select: {
          section: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!student) return cors(NextResponse.json(empty));

  const [invoiceRows, attendance, marks, noticeRows] = await Promise.all([
    db.invoice.findMany({
      where: { studentId, status: { notIn: ["CANCELLED", "DRAFT"] } },
      orderBy: { dueDate: "asc" },
      take: 40,
      select: {
        id: true,
        invoiceNo: true,
        period: true,
        total: true,
        amountPaid: true,
        amountDue: true,
        dueDate: true,
        status: true,
      },
    }),
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId, ...(yearId ? { academicYearId: yearId } : {}) },
      _count: { _all: true },
    }),
    db.markEntry.findMany({
      where: { studentId },
      select: {
        marksObtained: true,
        exam: { select: { maxMarks: true, term: { select: { sequence: true } } } },
      },
    }),
    db.notice.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: 15,
      select: { id: true, title: true, body: true, publishedAt: true },
    }),
  ]);

  // Attendance %
  let present = 0;
  let total = 0;
  for (const row of attendance) {
    total += row._count._all;
    if (row.status === "PRESENT" || row.status === "LATE") present += row._count._all;
  }
  const attendancePercent = total > 0 ? Math.round((present / total) * 100) : 0;

  // Average % and a per-term trend series
  const percents: number[] = [];
  const byTerm = new Map<number, number[]>();
  for (const m of marks) {
    const max = toNumber(m.exam.maxMarks);
    if (max <= 0) continue;
    const pct = (toNumber(m.marksObtained) / max) * 100;
    percents.push(pct);
    const t = m.exam.term.sequence;
    byTerm.set(t, [...(byTerm.get(t) ?? []), pct]);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const avgPercent = percents.length ? Math.round(avg(percents)) : 0;
  const trend = [...byTerm.keys()]
    .sort((a, b) => a - b)
    .map((t) => Math.round(avg(byTerm.get(t)!)))
    .join(",");

  const feeBalance = invoiceRows.reduce((s, i) => s + toNumber(i.amountDue), 0);
  const section = student.enrollments[0]?.section;
  const className = section
    ? `${section.classLevel.name} · ${section.name}`
    : "—";

  const now = Date.now();
  return cors(NextResponse.json({
    student: {
      id: student.id,
      name: `${student.firstName} ${student.lastName ?? ""}`.trim(),
      admissionNo: student.admissionNo,
      className,
      feeBalance,
      attendancePercent,
      avgPercent,
      trend,
    },
    invoices: invoiceRows.map((i) => {
      const due = toNumber(i.amountDue);
      const status =
        i.status === "PAID"
          ? "paid"
          : i.status === "OVERDUE" || (due > 0 && i.dueDate.getTime() < now)
            ? "overdue"
            : "due";
      return {
        id: i.id,
        title: i.period ?? i.invoiceNo,
        amount: toNumber(i.total),
        paid: toNumber(i.amountPaid),
        dueDate: i.dueDate.toISOString(),
        status,
      };
    }),
    notices: noticeRows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      date: (n.publishedAt ?? new Date()).toISOString(),
      read: 0,
    })),
  }));
}
