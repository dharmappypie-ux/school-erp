import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ yearId: z.string().min(1) });

/** POST /api/mobile/v1/admin/years/current — make a year the current one. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "academicyear.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const year = await db.academicYear.findUnique({ where: { id: parsed.data.yearId }, select: { id: true, name: true, isCurrent: true } });
  if (!year) return cors(NextResponse.json({ error: "Year not found in your school." }, { status: 404 }));
  if (year.isCurrent) return cors(NextResponse.json({ ok: true, message: `${year.name} is already current.` }));

  await db.$transaction([
    db.academicYear.updateMany({ where: { schoolId: session.schoolId, isCurrent: true }, data: { isCurrent: false } }),
    db.academicYear.update({ where: { id: year.id }, data: { isCurrent: true } }),
  ]);

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "settings.academicyear.setcurrent", entityType: "AcademicYear", entityId: year.id,
    after: { name: year.name, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `${year.name} is now the current year.` }));
}
