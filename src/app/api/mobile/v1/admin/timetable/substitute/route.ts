import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  slotId: z.string().min(1),
  substituteId: z.string().min(1, "Choose a teacher"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date"),
  reason: z.string().trim().max(200).optional(),
});

/**
 * POST /api/mobile/v1/admin/timetable/substitute — assign a substitute teacher
 * for one slot on one date, mirroring the web assignSubstitute (rejects the
 * same teacher and a clash where the substitute already teaches that period).
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "timetable.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { slotId, substituteId, date, reason } = parsed.data;

  const db = scopedDb(session.schoolId);
  const slot = await db.timetableSlot.findUnique({
    where: { id: slotId },
    select: { id: true, dayOfWeek: true, periodId: true, teacherId: true },
  });
  if (!slot) return cors(NextResponse.json({ error: "Timetable slot not found in your school." }, { status: 404 }));
  if (slot.teacherId === substituteId) {
    return cors(NextResponse.json({ error: "That teacher already takes this period." }, { status: 409 }));
  }

  const clash = await db.timetableSlot.findFirst({
    where: { teacherId: substituteId, dayOfWeek: slot.dayOfWeek, periodId: slot.periodId, id: { not: slotId } },
    select: { id: true },
  });
  if (clash) {
    return cors(NextResponse.json({ error: "That teacher is already teaching another class this period." }, { status: 409 }));
  }

  const substitute = await db.staffMember.findUnique({ where: { id: substituteId }, select: { id: true, firstName: true } });
  if (!substitute) return cors(NextResponse.json({ error: "Teacher not found in your school." }, { status: 404 }));

  const day = new Date(`${date}T00:00:00.000Z`);
  await db.timetableSubstitution.upsert({
    where: { slotId_date: { slotId, date: day } },
    create: { slotId, date: day, substituteId, reason: reason || null },
    update: { substituteId, reason: reason || null },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "timetable.substitute", entityType: "TimetableSlot", entityId: slotId,
    after: { substituteId, date, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `${substitute.firstName} assigned as substitute for ${date}.` }));
}
