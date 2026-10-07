import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/student/[id] — current details for the edit form. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, ["students.read", "students.update"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;
  const db = scopedDb(session.schoolId);

  const s = await db.student.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, admissionNo: true, status: true,
      phone: true, email: true,
      enrollments: {
        where: { isActive: true }, take: 1,
        select: { section: { select: { name: true, classLevel: { select: { name: true } } } } },
      },
    },
  });
  if (!s) return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));
  const sec = s.enrollments[0]?.section;
  return cors(NextResponse.json({
    id: s.id, firstName: s.firstName, lastName: s.lastName ?? "", admissionNo: s.admissionNo,
    status: s.status, phone: s.phone ?? "", email: s.email ?? "",
    className: sec ? `${sec.classLevel.name} · ${sec.name}` : "—",
  }));
}

const Schema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "ALUMNI", "TRANSFERRED", "DROPPED", "SUSPENDED", "ON_LEAVE"]),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
});

/** POST /api/mobile/v1/admin/student/[id] — update key fields + lifecycle status. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, "students.update");
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const db = scopedDb(session.schoolId);
  const existing = await db.student.findUnique({ where: { id }, select: { id: true, status: true, exitDate: true } });
  if (!existing) return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));

  const leavingActive = existing.status === "ACTIVE" && parsed.data.status !== "ACTIVE";
  const returningActive = existing.status !== "ACTIVE" && parsed.data.status === "ACTIVE";

  await db.student.update({
    where: { id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName || null,
      status: parsed.data.status,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      exitDate: leavingActive ? (existing.exitDate ?? new Date()) : returningActive ? null : existing.exitDate,
    },
  });
  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "students.update", entityType: "Student", entityId: id,
    before: { status: existing.status }, after: { status: parsed.data.status, via: "mobile" },
  });
  return cors(NextResponse.json({ ok: true, message: `${parsed.data.firstName}'s record updated.` }));
}
