import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const _d = (x: Date) => x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** GET /api/mobile/v1/admin/years — academic years, current first. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["academicyear.manage", "school.settings", "school.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.academicYear.findMany({
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
    select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true },
  });

  return cors(NextResponse.json({
    items: rows.map((y) => ({
      id: y.id, name: y.name, span: `${_d(y.startDate)} – ${_d(y.endDate)}`, current: y.isCurrent,
    })),
  }));
}

const Schema = z.object({
  name: z.string().trim().min(4, "A year name is required, e.g. 2026-27").max(20),
  startDate: z.string().min(1, "A start date is required"),
  endDate: z.string().min(1, "An end date is required"),
  makeCurrent: z.boolean().optional(),
});

/** POST /api/mobile/v1/admin/years — create an academic year. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "academicyear.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return cors(NextResponse.json({ error: "Enter a valid start and end date (end after start)." }, { status: 400 }));
  }
  const makeCurrent = parsed.data.makeCurrent ?? false;

  const db = scopedDb(session.schoolId);
  const year = await db.$transaction(async (tx) => {
    if (makeCurrent) {
      await tx.academicYear.updateMany({ where: { schoolId: session.schoolId, isCurrent: true }, data: { isCurrent: false } });
    }
    return tx.academicYear.create({
      data: { schoolId: session.schoolId, name: parsed.data.name, startDate: start, endDate: end, isCurrent: makeCurrent },
      select: { id: true, name: true, isCurrent: true },
    });
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "settings.academicyear.create", entityType: "AcademicYear", entityId: year.id,
    after: { name: year.name, isCurrent: year.isCurrent, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: year.isCurrent ? `${year.name} created and set as the current year.` : `${year.name} created.`,
  }));
}
