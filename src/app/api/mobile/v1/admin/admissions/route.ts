import { NextResponse } from "next/server";

import { APPLICATION_FLOW, STATUS_LABEL } from "@/lib/admissions";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/admissions — applications with their next stages. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["admissions.manage", "admissions.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.admissionApplication.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, applicationNo: true, firstName: true, lastName: true, status: true,
      guardianName: true,
      classLevel: { select: { name: true } },
    },
  });

  return cors(NextResponse.json({
    canManage: guard.permissions.includes("*") || guard.permissions.includes("admissions.manage") || guard.permissions.includes("admissions.*"),
    items: rows.map((a) => ({
      id: a.id,
      applicationNo: a.applicationNo,
      name: `${a.firstName} ${a.lastName ?? ""}`.trim(),
      className: a.classLevel?.name ?? "—",
      guardian: a.guardianName,
      status: a.status,
      statusLabel: STATUS_LABEL[a.status] ?? a.status,
      nextStages: (APPLICATION_FLOW[a.status] ?? []).map((s) => ({ key: s, label: STATUS_LABEL[s] ?? s })),
    })),
  }));
}
