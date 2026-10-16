import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  name: z.string().trim().min(2, "Name the route").max(120),
  code: z.string().trim().max(20).optional(),
  vehicleId: z.string().trim().optional(),
  startPoint: z.string().trim().max(160).optional(),
  endPoint: z.string().trim().max(160).optional(),
  distanceKm: z.coerce.number().positive().optional(),
});

/** POST /api/mobile/v1/admin/transport/route-create — create a transport route (mirror of web saveRoute). */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "transport.manage", { feature: "transport" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const d = parsed.data;

  const db = scopedDb(session.schoolId);
  if (d.vehicleId) {
    const vehicle = await db.vehicle.findUnique({ where: { id: d.vehicleId }, select: { id: true } });
    if (!vehicle) return cors(NextResponse.json({ error: "That vehicle is not on your fleet." }, { status: 404 }));
  }

  const route = await db.route.create({
    data: {
      schoolId: session.schoolId,
      name: d.name,
      code: d.code || null,
      vehicleId: d.vehicleId || null,
      startPoint: d.startPoint || null,
      endPoint: d.endPoint || null,
      distanceKm: d.distanceKm ?? null,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "transport.route.create", entityType: "Route", entityId: route.id,
    after: { name: route.name, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Route “${route.name}” created.` }));
}
