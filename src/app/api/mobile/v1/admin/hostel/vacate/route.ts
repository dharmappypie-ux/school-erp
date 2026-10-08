import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ allocationId: z.string().min(1) });

/** POST /api/mobile/v1/admin/hostel/vacate — free a bed. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "hostel.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const allocation = await db.hostelAllocation.findUnique({
    where: { id: parsed.data.allocationId },
    select: { id: true, isActive: true, student: { select: { firstName: true } } },
  });
  if (!allocation) return cors(NextResponse.json({ error: "Allocation not found in your school." }, { status: 404 }));
  if (!allocation.isActive) return cors(NextResponse.json({ error: "That bed is already vacated." }, { status: 409 }));

  await db.hostelAllocation.update({ where: { id: allocation.id }, data: { isActive: false, vacatedOn: new Date() } });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "hostel.vacate", entityType: "HostelAllocation", entityId: allocation.id, after: { via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `${allocation.student.firstName}'s bed vacated.` }));
}
