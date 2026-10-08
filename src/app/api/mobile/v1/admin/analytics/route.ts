import { NextResponse } from "next/server";

import { agingBuckets, distribution, mean, rankGroups, trend } from "@/lib/analytics";
import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const GRADE_BANDS = [
  { label: "90–100", min: 90, max: 100 },
  { label: "75–89", min: 75, max: 89.99 },
  { label: "60–74", min: 60, max: 74.99 },
  { label: "45–59", min: 45, max: 59.99 },
  { label: "Below 45", min: 0, max: 44.99 },
];

/**
 * GET /api/mobile/v1/admin/analytics
 *
 * The school analytics dashboard data — enrolment, attendance (30-day rate +
 * 14-day trend series), academic performance (grade spread, pass rate, subject
 * & class rankings), finance (collection rate, aging, trend) and admissions.
 * Mirror of the web /analytics page, reusing the shared lib/analytics helpers.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["analytics.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  const now = new Date();
  const thirty = new Date(now.getTime() - 30 * 86400000);
  const sixty = new Date(now.getTime() - 60 * 86400000);

  const [
    studentsByStatus, studentsByGender, sections,
    attRecent, attPrior, attDaily, marks, invoices,
    payRecent, payPrior, admissionFunnel,
    transportAssigned, hostelAllocated, booksOnLoan, staffCount,
  ] = await Promise.all([
    db.student.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    db.student.groupBy({ by: ["gender"], where: { deletedAt: null, status: "ACTIVE" }, _count: { _all: true } }),
    yearId ? db.section.findMany({
      where: { academicYearId: yearId },
      select: { capacity: true, _count: { select: { enrollments: { where: { isActive: true } } } } },
    }) : [],
    db.attendanceRecord.groupBy({ by: ["status"], where: { date: { gte: thirty } }, _count: { _all: true } }),
    db.attendanceRecord.groupBy({ by: ["status"], where: { date: { gte: sixty, lt: thirty } }, _count: { _all: true } }),
    db.attendanceRecord.groupBy({ by: ["date", "status"], where: { date: { gte: thirty } }, _count: { _all: true } }),
    db.markEntry.findMany({
      where: { isAbsent: false },
      select: {
        marksObtained: true,
        exam: { select: { maxMarks: true, subject: { select: { id: true, name: true, isGraded: true } }, classLevel: { select: { id: true, name: true } } } },
      },
    }),
    db.invoice.findMany({ where: yearId ? { academicYearId: yearId } : {}, select: { dueDate: true, amountDue: true, total: true, amountPaid: true } }),
    db.payment.aggregate({ where: { status: "SUCCESS", paidAt: { gte: thirty, lt: now } }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { status: "SUCCESS", paidAt: { gte: sixty, lt: thirty } }, _sum: { amount: true } }),
    db.admissionApplication.groupBy({ by: ["status"], where: yearId ? { academicYearId: yearId } : {}, _count: { _all: true } }),
    db.transportAssignment.count({ where: { isActive: true } }),
    db.hostelAllocation.count({ where: { isActive: true } }),
    db.bookIssue.count({ where: { returnedOn: null } }),
    db.staffMember.count({ where: { employmentStatus: "ACTIVE", deletedAt: null } }),
  ]);

  const activeStudents = studentsByStatus.find((r) => r.status === "ACTIVE")?._count._all ?? 0;
  const totalCapacity = sections.reduce((s, x) => s + x.capacity, 0);
  const totalEnrolled = sections.reduce((s, x) => s + x._count.enrollments, 0);

  const rate = (rows: { status: string; _count: { _all: number } }[]) => {
    const total = rows.reduce((s, r) => s + r._count._all, 0);
    if (total === 0) return 0;
    const present = rows.filter((r) => r.status === "PRESENT" || r.status === "LATE").reduce((s, r) => s + r._count._all, 0);
    return (present / total) * 100;
  };
  const attendanceNow = Math.round(rate(attRecent) * 10) / 10;
  const attendanceTrend = trend(attendanceNow, Math.round(rate(attPrior) * 10) / 10);

  const dailyMap = new Map<string, { present: number; total: number }>();
  for (const row of attDaily) {
    const key = row.date.toISOString().slice(0, 10);
    const e = dailyMap.get(key) ?? { present: 0, total: 0 };
    e.total += row._count._all;
    if (row.status === "PRESENT" || row.status === "LATE") e.present += row._count._all;
    dailyMap.set(key, e);
  }
  const dailySeries = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([k, e]) => ({
    label: k.slice(5),
    value: e.total > 0 ? Math.round((e.present / e.total) * 100) : 0,
  }));

  const scored = marks
    .filter((m) => m.exam.subject.isGraded && toNumber(m.exam.maxMarks) > 0)
    .map((m) => ({
      percent: (toNumber(m.marksObtained) / toNumber(m.exam.maxMarks)) * 100,
      subjectId: m.exam.subject.id, subjectName: m.exam.subject.name,
      classId: m.exam.classLevel.id, className: m.exam.classLevel.name,
    }));
  const gradeSpread = distribution(scored.map((r) => r.percent), GRADE_BANDS);
  const overallMean = mean(scored.map((r) => r.percent));
  const passRate = scored.length > 0 ? (scored.filter((r) => r.percent >= 33).length / scored.length) * 100 : null;

  const bySubject = new Map<string, { label: string; values: number[] }>();
  for (const r of scored) {
    const e = bySubject.get(r.subjectId) ?? { label: r.subjectName, values: [] };
    e.values.push(r.percent); bySubject.set(r.subjectId, e);
  }
  const subjectRanking = rankGroups([...bySubject.entries()].map(([key, v]) => ({ key, ...v })), { minimumSample: 20 });

  const byClass = new Map<string, { label: string; values: number[] }>();
  for (const r of scored) {
    const e = byClass.get(r.classId) ?? { label: r.className, values: [] };
    e.values.push(r.percent); byClass.set(r.classId, e);
  }
  const classRanking = rankGroups([...byClass.entries()].map(([key, v]) => ({ key, ...v })), { minimumSample: 20 });

  const invoiceRows = invoices.map((i) => ({ dueDate: i.dueDate, amountDue: toNumber(i.amountDue) }));
  const aging = agingBuckets(invoiceRows, now);
  const totalOverdue = aging.reduce((s, b) => s + b.amount, 0);
  const billed = invoices.reduce((s, i) => s + toNumber(i.total), 0);
  const collected = invoices.reduce((s, i) => s + toNumber(i.amountPaid), 0);
  const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;
  const collectionTrend = trend(toNumber(payRecent._sum.amount), toNumber(payPrior._sum.amount));

  const applications = admissionFunnel.reduce((s, r) => s + r._count._all, 0);

  return cors(NextResponse.json({
    enrolment: {
      activeStudents, staffCount, totalCapacity, totalEnrolled,
      utilisation: totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0,
      byStatus: studentsByStatus.map((r) => ({ label: r.status, value: r._count._all })),
      byGender: studentsByGender.map((r) => ({ label: r.gender ?? "—", value: r._count._all })),
    },
    attendance: {
      rate: attendanceNow,
      trend: attendanceTrend,
      daily: dailySeries,
    },
    academics: {
      mean: overallMean != null ? Math.round(overallMean * 10) / 10 : null,
      passRate: passRate != null ? Math.round(passRate * 10) / 10 : null,
      assessments: scored.length,
      gradeSpread: gradeSpread.bands.map((b) => ({ label: b.label, count: b.count, percent: b.percent })),
      topSubjects: subjectRanking.filter((g) => g.comparable).slice(0, 3).map((g) => ({ label: g.label, value: Math.round(g.value * 10) / 10 })),
      bottomSubjects: subjectRanking.filter((g) => g.comparable).slice(-3).reverse().map((g) => ({ label: g.label, value: Math.round(g.value * 10) / 10 })),
      classRanking: classRanking.filter((g) => g.comparable).map((g) => ({ label: g.label, value: Math.round(g.value * 10) / 10 })),
    },
    finance: {
      billed, collected, collectionRate: Math.round(collectionRate * 10) / 10,
      totalOverdue, collectionTrend,
      aging: aging.map((b) => ({ label: b.label, amount: b.amount, count: b.count })),
    },
    admissions: {
      applications,
      funnel: admissionFunnel.map((r) => ({ label: r.status, value: r._count._all })),
    },
    services: { transportAssigned, hostelAllocated, booksOnLoan },
  }));
}
