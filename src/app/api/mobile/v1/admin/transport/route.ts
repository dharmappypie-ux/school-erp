import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/transport — routes with their stops, to add to. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["transport.manage", "transport.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const [rows, vehicles] = await Promise.all([
    db.route.findMany({
      orderBy: { name: "asc" },
      take: 100,
      select: {
        id: true, name: true, startPoint: true, endPoint: true,
        vehicle: { select: { registrationNo: true } },
        stops: { orderBy: { sequence: "asc" }, select: { name: true, pickupTime: true } },
      },
    }),
    db.vehicle.findMany({
      orderBy: { registrationNo: "asc" },
      select: { id: true, registrationNo: true, vehicleType: true, capacity: true, driverName: true },
    }),
  ]);

  return cors(NextResponse.json({
    canManage: guard.permissions.includes("*") || guard.permissions.includes("transport.manage") || guard.permissions.includes("transport.*"),
    vehicles: vehicles.map((v) => ({
      id: v.id, registrationNo: v.registrationNo, vehicleType: v.vehicleType,
      capacity: v.capacity, driverName: v.driverName,
    })),
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      vehicle: r.vehicle?.registrationNo ?? null,
      route: [r.startPoint, r.endPoint].filter(Boolean).join(" → "),
      stops: r.stops.map((s) => ({ name: s.name, pickupTime: s.pickupTime })),
    })),
  }));
}
