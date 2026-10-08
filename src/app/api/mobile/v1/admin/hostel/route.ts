import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/hostel — rooms (with free beds) + current allocations. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["hostel.manage", "hostel.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const [rooms, allocations] = await Promise.all([
    db.hostelRoom.findMany({
      where: { hostel: { schoolId: session.schoolId } },
      orderBy: { roomNumber: "asc" },
      take: 200,
      select: {
        id: true, roomNumber: true, capacity: true,
        hostel: { select: { name: true } },
        _count: { select: { allocations: { where: { isActive: true } } } },
      },
    }),
    db.hostelAllocation.findMany({
      where: { isActive: true },
      orderBy: { allocatedOn: "desc" },
      take: 200,
      select: {
        id: true, bedNumber: true,
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
        room: { select: { roomNumber: true, hostel: { select: { name: true } } } },
      },
    }),
  ]);

  return cors(NextResponse.json({
    canManage: guard.permissions.includes("*") || guard.permissions.includes("hostel.manage") || guard.permissions.includes("hostel.*"),
    rooms: rooms.map((r) => ({
      id: r.id,
      label: `${r.hostel.name} · ${r.roomNumber}`,
      occupied: r._count.allocations,
      capacity: r.capacity,
      free: Math.max(0, r.capacity - r._count.allocations),
    })),
    allocations: allocations.map((a) => ({
      id: a.id,
      student: `${a.student.firstName} ${a.student.lastName ?? ""}`.trim(),
      admissionNo: a.student.admissionNo,
      room: `${a.room.hostel.name} · ${a.room.roomNumber}${a.bedNumber ? ` (bed ${a.bedNumber})` : ""}`,
    })),
  }));
}
