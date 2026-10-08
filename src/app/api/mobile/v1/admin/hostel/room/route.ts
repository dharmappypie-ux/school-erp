import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  hostelId: z.string().min(1, "Choose a block"),
  roomNumber: z.string().trim().min(1, "Enter the room number").max(20),
  floor: z.string().trim().max(20).optional(),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(20),
  roomType: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORMITORY"]),
  monthlyFee: z.coerce.number().min(0).optional(),
});

/** POST /api/mobile/v1/admin/hostel/room — add a room to a block (mirror of web addRoom). */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "hostel.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const d = parsed.data;

  const db = scopedDb(session.schoolId);
  const block = await db.hostel.findUnique({ where: { id: d.hostelId }, select: { id: true, name: true } });
  if (!block) return cors(NextResponse.json({ error: "That block is not in your school." }, { status: 404 }));

  const clash = await db.hostelRoom.findFirst({
    where: { hostelId: block.id, roomNumber: d.roomNumber }, select: { id: true },
  });
  if (clash) {
    return cors(NextResponse.json({ error: `Room ${d.roomNumber} already exists in ${block.name}.` }, { status: 409 }));
  }

  const room = await db.hostelRoom.create({
    data: {
      hostelId: block.id,
      roomNumber: d.roomNumber,
      floor: d.floor || null,
      capacity: d.capacity,
      roomType: d.roomType,
      monthlyFee: d.monthlyFee ?? null,
    },
    select: { id: true, roomNumber: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "hostel.room.create", entityType: "HostelRoom", entityId: room.id,
    after: { roomNumber: room.roomNumber, block: block.name, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Room ${room.roomNumber} added to ${block.name}.` }));
}
