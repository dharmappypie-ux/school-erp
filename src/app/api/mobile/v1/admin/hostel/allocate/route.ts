import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  roomId: z.string().min(1, "Choose a room"),
  studentId: z.string().min(1, "Choose a student"),
  bedNumber: z.string().trim().max(10).optional(),
});

/** POST /api/mobile/v1/admin/hostel/allocate — give a student a bed. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "hostel.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const yearId = session.academicYearId;
  if (!yearId) return cors(NextResponse.json({ error: "Set up a current academic year first." }, { status: 409 }));

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const room = await db.hostelRoom.findFirst({
    where: { id: parsed.data.roomId, hostel: { schoolId: session.schoolId } },
    select: { id: true, roomNumber: true, capacity: true, allocations: { where: { isActive: true }, select: { id: true } } },
  });
  if (!room) return cors(NextResponse.json({ error: "Room not found in your school." }, { status: 404 }));

  const student = await db.student.findUnique({ where: { id: parsed.data.studentId }, select: { id: true, firstName: true } });
  if (!student) return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));

  const existing = await db.hostelAllocation.findFirst({
    where: { studentId: student.id, isActive: true },
    select: { room: { select: { roomNumber: true } } },
  });
  if (existing) {
    return cors(NextResponse.json({ error: `${student.firstName} already has room ${existing.room.roomNumber}. Vacate it first.` }, { status: 409 }));
  }
  if (room.allocations.length >= room.capacity) {
    return cors(NextResponse.json({ error: `Room ${room.roomNumber} is full (${room.allocations.length}/${room.capacity}).` }, { status: 409 }));
  }

  await db.hostelAllocation.create({
    data: { schoolId: session.schoolId, studentId: student.id, academicYearId: yearId, roomId: room.id, bedNumber: parsed.data.bedNumber || null },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "hostel.allocate", entityType: "HostelAllocation", entityId: room.id,
    after: { studentId: student.id, roomId: room.id, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `${student.firstName} allocated to room ${room.roomNumber}.` }));
}
