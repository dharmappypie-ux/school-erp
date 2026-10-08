import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  routeId: z.string().min(1),
  name: z.string().trim().min(2, "Name the stop").max(120),
  pickupTime: z.string().trim().max(10).optional(),
  dropTime: z.string().trim().max(10).optional(),
});

/** POST /api/mobile/v1/admin/transport/stop — add a stop to a route. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "transport.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const route = await db.route.findUnique({ where: { id: parsed.data.routeId }, select: { id: true, name: true } });
  if (!route) return cors(NextResponse.json({ error: "Route not found in your school." }, { status: 404 }));

  const last = await db.routeStop.findFirst({ where: { routeId: route.id }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  await db.routeStop.create({
    data: {
      routeId: route.id,
      name: parsed.data.name,
      sequence: (last?.sequence ?? 0) + 1,
      pickupTime: parsed.data.pickupTime || null,
      dropTime: parsed.data.dropTime || null,
    },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "transport.stop.add", entityType: "Route", entityId: route.id,
    after: { stop: parsed.data.name, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `“${parsed.data.name}” added to ${route.name}.` }));
}
