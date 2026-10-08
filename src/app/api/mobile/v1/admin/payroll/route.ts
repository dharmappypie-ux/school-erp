import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/payroll — recent payslips, to mark paid. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["payroll.manage", "payroll.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.payslip.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 120,
    select: {
      id: true, month: true, year: true, netPay: true, status: true,
      staff: { select: { firstName: true, lastName: true, employeeId: true } },
    },
  });

  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return cors(NextResponse.json({
    canManage: guard.permissions.includes("*") || guard.permissions.includes("payroll.manage") || guard.permissions.includes("payroll.*"),
    items: rows.map((p) => ({
      id: p.id,
      staff: `${p.staff.firstName} ${p.staff.lastName ?? ""}`.trim(),
      employeeId: p.staff.employeeId,
      period: `${months[p.month] ?? p.month} ${p.year}`,
      netPay: toNumber(p.netPay),
      status: p.status,
    })),
  }));
}
