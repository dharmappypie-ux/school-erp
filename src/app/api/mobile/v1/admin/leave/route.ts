import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const _day = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * GET /api/mobile/v1/admin/leave — staff leave requests, pending first, so the
 * approver can act on them from the phone.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["leave.approve", "leave.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.leaveRequest.findMany({
    orderBy: [{ status: "asc" }, { fromDate: "desc" }],
    take: 100,
    select: {
      id: true,
      fromDate: true,
      toDate: true,
      days: true,
      reason: true,
      status: true,
      leaveType: { select: { name: true } },
      staff: { select: { firstName: true, lastName: true, employeeId: true } },
    },
  });

  return cors(NextResponse.json({
    canDecide: guard.permissions.includes("*") || guard.permissions.includes("leave.approve") || guard.permissions.includes("leave.*"),
    items: rows.map((r) => ({
      id: r.id,
      staffName: `${r.staff.firstName} ${r.staff.lastName ?? ""}`.trim(),
      employeeId: r.staff.employeeId,
      type: r.leaveType.name,
      dates: r.fromDate.getTime() === r.toDate.getTime() ? _day(r.fromDate) : `${_day(r.fromDate)} – ${_day(r.toDate)}`,
      days: toNumber(r.days),
      reason: r.reason,
      status: r.status,
    })),
  }));
}
