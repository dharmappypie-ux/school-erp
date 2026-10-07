import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/staff/[id] — current details for the edit form. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, ["staff.read", "staff.update"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;
  const db = scopedDb(session.schoolId);

  const s = await db.staffMember.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, email: true, employeeId: true,
      staffType: true, employmentStatus: true,
    },
  });
  if (!s) return cors(NextResponse.json({ error: "Staff not found in your school." }, { status: 404 }));
  return cors(NextResponse.json({
    id: s.id, firstName: s.firstName, lastName: s.lastName ?? "", email: s.email ?? "",
    employeeId: s.employeeId, staffType: s.staffType, employmentStatus: s.employmentStatus,
  }));
}

const Schema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  email: z.string().trim().email("A valid email is required"),
  staffType: z.enum(["TEACHING", "NON_TEACHING", "ADMINISTRATIVE", "SUPPORT", "MANAGEMENT"]),
  employmentStatus: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "RESIGNED", "TERMINATED", "RETIRED"]),
});

/** POST /api/mobile/v1/admin/staff/[id] — update core details + employment status. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, "staff.update");
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const db = scopedDb(session.schoolId);
  const staff = await db.staffMember.findUnique({ where: { id }, select: { id: true, userId: true, employmentStatus: true } });
  if (!staff) return cors(NextResponse.json({ error: "Staff not found in your school." }, { status: 404 }));

  const email = parsed.data.email.toLowerCase();
  const clash = await db.user.findFirst({
    where: { email, NOT: staff.userId ? { id: staff.userId } : undefined },
    select: { id: true },
  });
  if (clash) {
    return cors(NextResponse.json({ error: "Another user already has that email." }, { status: 409 }));
  }

  await db.$transaction(async (tx) => {
    await tx.staffMember.update({
      where: { id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        email,
        staffType: parsed.data.staffType,
        employmentStatus: parsed.data.employmentStatus,
      },
    });
    if (staff.userId) await tx.user.update({ where: { id: staff.userId }, data: { email } });
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "staff.update", entityType: "StaffMember", entityId: id,
    before: { employmentStatus: staff.employmentStatus }, after: { employmentStatus: parsed.data.employmentStatus, via: "mobile" },
  });
  return cors(NextResponse.json({ ok: true, message: `${parsed.data.firstName}'s record updated.` }));
}
