import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { hasAnyPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/overview
 *
 * School-wide headline numbers for the admin dashboard: people, structure,
 * fees outstanding vs collected, and today's attendance rate.
 *
 * The dashboard is open to any staff role that may read the school, so the
 * money is gated separately: a librarian holds `school.read` and has no
 * business knowing the term's collection. Those fields come back null for them
 * and the app drops the tiles rather than printing a blank figure.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["analytics.read", "students.read", "school.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const today = new Date();
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  // Not merely hidden in the response — not queried at all when the caller may
  // not see it, so the figure never leaves the database.
  const canSeeMoney = hasAnyPermission(session.permissions, [
    "fees.read",
    "fees.report",
  ]);

  const [students, staff, sections, subjects, feeAgg, todayAttendance, pendingInvoices] =
    await Promise.all([
      db.student.count({ where: { status: "ACTIVE" } }),
      db.staffMember.count({ where: { employmentStatus: "ACTIVE" } }),
      db.section.count({ where: yearId ? { academicYearId: yearId } : {} }),
      db.subject.count(),
      canSeeMoney
        ? db.invoice.aggregate({
            where: { status: { notIn: ["CANCELLED", "DRAFT"] } },
            _sum: { amountDue: true, amountPaid: true },
          })
        : Promise.resolve(null),
      db.attendanceRecord.groupBy({
        by: ["status"],
        where: { date: dayStart },
        _count: { _all: true },
      }),
      canSeeMoney
        ? db.invoice.count({
            where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
          })
        : Promise.resolve(null),
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
    feeDue: feeAgg ? toNumber(feeAgg._sum.amountDue ?? 0) : null,
    feeCollected: feeAgg ? toNumber(feeAgg._sum.amountPaid ?? 0) : null,
    pendingInvoices,
    todayAttendancePercent: marked > 0 ? Math.round((present / marked) * 100) : null,
    todayMarked: marked,
  }));
}
