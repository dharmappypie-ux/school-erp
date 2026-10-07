import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/overview
 *
 * School-wide headline numbers for the admin dashboard: people, structure,
 * fees outstanding vs collected, and today's attendance rate.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["analytics.read", "students.read", "school.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const today = new Date();
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const [students, staff, sections, subjects, feeAgg, todayAttendance, pendingInvoices] =
    await Promise.all([
      db.student.count({ where: { status: "ACTIVE" } }),
      db.staffMember.count({ where: { employmentStatus: "ACTIVE" } }),
      db.section.count({ where: yearId ? { academicYearId: yearId } : {} }),
      db.subject.count(),
      db.invoice.aggregate({
        where: { status: { notIn: ["CANCELLED", "DRAFT"] } },
        _sum: { amountDue: true, amountPaid: true },
      }),
      db.attendanceRecord.groupBy({
        by: ["status"],
        where: { date: dayStart },
        _count: { _all: true },
      }),
      db.invoice.count({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } } }),
    ]);

  let present = 0;
  let marked = 0;
  for (const row of todayAttendance) {
    marked += row._count._all;
    if (row.status === "PRESENT" || row.status === "LATE") present += row._count._all;
  }

  return cors(NextResponse.json({
    schoolName: session.schoolName,
    adminName: session.name,
    students,
    staff,
    sections,
    subjects,
    feeDue: toNumber(feeAgg._sum.amountDue ?? 0),
    feeCollected: toNumber(feeAgg._sum.amountPaid ?? 0),
    pendingInvoices,
    todayAttendancePercent: marked > 0 ? Math.round((present / marked) * 100) : null,
    todayMarked: marked,
  }));
}
