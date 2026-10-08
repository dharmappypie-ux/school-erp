import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

/** GET /api/mobile/v1/admin/timetable?sectionId= — a class's weekly slots. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["timetable.manage", "timetable.read", "academics.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const sectionId = new URL(req.url).searchParams.get("sectionId");
  if (!sectionId) return cors(NextResponse.json({ error: "sectionId is required" }, { status: 400 }));

  const db = scopedDb(session.schoolId);
  const slots = await db.timetableSlot.findMany({
    where: { sectionId },
    select: {
      id: true, dayOfWeek: true,
      period: { select: { name: true, sequence: true, startTime: true } },
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  slots.sort((a, b) =>
    DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.period.sequence - b.period.sequence);

  return cors(NextResponse.json({
    canManage: guard.permissions.includes("*") || guard.permissions.includes("timetable.manage") || guard.permissions.includes("timetable.*"),
    items: slots.map((s) => ({
      id: s.id,
      day: s.dayOfWeek[0] + s.dayOfWeek.slice(1).toLowerCase(),
      period: `${s.period.name} · ${s.period.startTime}`,
      subject: s.subject?.name ?? "—",
      teacher: s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName ?? ""}`.trim() : "Unassigned",
    })),
  }));
}
