import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  registrationNo: z.string().trim().min(4, "Enter the registration number").max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, "")),
  model: z.string().trim().max(80).optional(),
  vehicleType: z.enum(["BUS", "VAN", "CAR", "TEMPO"]),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(120),
  driverName: z.string().trim().max(120).optional(),
  driverPhone: z.string().trim().max(20).optional(),
  driverLicense: z.string().trim().max(40).optional(),
});

/** POST /api/mobile/v1/admin/transport/vehicle — add a vehicle to the fleet (mirror of web saveVehicle). */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "transport.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const d = parsed.data;

  const db = scopedDb(session.schoolId);
  const clash = await db.vehicle.findFirst({ where: { registrationNo: d.registrationNo }, select: { id: true } });
  if (clash) return cors(NextResponse.json({ error: `${d.registrationNo} is already on the fleet.` }, { status: 409 }));

  const vehicle = await db.vehicle.create({
    data: {
      schoolId: session.schoolId,
      registrationNo: d.registrationNo,
      model: d.model || null,
      vehicleType: d.vehicleType,
      capacity: d.capacity,
      driverName: d.driverName || null,
      driverPhone: d.driverPhone || null,
      driverLicense: d.driverLicense || null,
    },
    select: { id: true, registrationNo: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "transport.vehicle.create", entityType: "Vehicle", entityId: vehicle.id,
    after: { registrationNo: vehicle.registrationNo, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `${vehicle.registrationNo} added to the fleet.` }));
}
