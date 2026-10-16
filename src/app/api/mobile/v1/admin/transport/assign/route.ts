import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  studentId: z.string().min(1, "Choose a student"),
  routeId: z.string().min(1, "Choose a route"),
  stopId: z.string().min(1, "Choose a stop"),
});

/**
 * POST /api/mobile/v1/admin/transport/assign
 *
 * Assigns a student to a route + stop for the current year (one assignment per
 * student per year — re-assigning updates it). Gated on transport.manage.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "transport.manage", { feature: "transport" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  if (!session.academicYearId) {
    return cors(NextResponse.json({ error: "No academic year is marked current." }, { status: 409 }));
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { studentId, routeId, stopId } = parsed.data;

  const db = scopedDb(session.schoolId);
  const [student, stop] = await Promise.all([
    db.student.findUnique({ where: { id: studentId }, select: { id: true, firstName: true, lastName: true } }),
    db.routeStop.findFirst({ where: { id: stopId, routeId }, select: { id: true, name: true, route: { select: { name: true } } } }),
  ]);
  if (!student) return cors(NextResponse.json({ error: "That student is not in your school." }, { status: 404 }));
  if (!stop) return cors(NextResponse.json({ error: "That stop is not on the chosen route." }, { status: 404 }));

  await db.transportAssignment.upsert({
    where: { studentId_academicYearId: { studentId, academicYearId: session.academicYearId } },
    create: {
      schoolId: session.schoolId, studentId, routeId, stopId,
      academicYearId: session.academicYearId, isActive: true,
    },
    update: { routeId, stopId, isActive: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "transport.assign", entityType: "Student", entityId: studentId,
    after: { routeId, stopId, via: "mobile" },
  });

  const name = `${student.firstName} ${student.lastName ?? ""}`.trim();
  return cors(NextResponse.json({
    ok: true,
    message: `${name} assigned to ${stop.route.name} · ${stop.name}.`,
  }));
}
