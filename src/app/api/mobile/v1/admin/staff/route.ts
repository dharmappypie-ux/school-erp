import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { hashPassword } from "@/lib/password";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/staff?q= — active staff, newest first. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["staff.read", "staff.create"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const q = new URL(req.url).searchParams.get("q")?.trim();

  const rows = await db.staffMember.findMany({
    where: {
      employmentStatus: "ACTIVE",
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { employeeId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { employeeId: "desc" },
    take: 100,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
      staffType: true,
      email: true,
      user: { select: { roles: { select: { key: true, name: true } } } },
    },
  });

  return cors(NextResponse.json({
    staff: rows.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
      employeeId: s.employeeId,
      staffType: s.staffType,
      email: s.email ?? "",
      role: s.user?.roles[0]?.name ?? s.user?.roles[0]?.key ?? "—",
    })),
  }));
}

const CreateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  email: z.string().trim().email("A valid email is required for the login"),
  phone: z.string().trim().optional(),
  staffType: z.enum(["TEACHING", "NON_TEACHING", "ADMINISTRATIVE", "SUPPORT", "MANAGEMENT"]),
  roleKey: z.string().trim().min(1, "Choose a system role"),
  qualification: z.string().trim().optional(),
  joiningDate: z.string().trim().optional(),
});

/**
 * POST /api/mobile/v1/admin/staff
 *
 * Mobile mirror of the web `createStaff` action: creates the login User and the
 * StaffMember in one transaction, with a sequential employee id and temp
 * password.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "staff.create");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    ));
  }
  const input = parsed.data;
  const email = input.email.toLowerCase();

  const db = scopedDb(session.schoolId);

  const existing = await db.user.findFirst({ where: { email }, select: { id: true } });
  if (existing) {
    return cors(NextResponse.json(
      { error: "A user with that email already exists in this school." },
      { status: 409 },
    ));
  }

  const role = await db.role.findUnique({
    where: { schoolId_key: { schoolId: session.schoolId, key: input.roleKey } },
    select: { id: true, key: true },
  });
  if (!role) {
    return cors(NextResponse.json({ error: "That system role does not exist." }, { status: 400 }));
  }

  const latest = await db.staffMember.findFirst({
    where: { employeeId: { startsWith: "EMP" } },
    orderBy: { employeeId: "desc" },
    select: { employeeId: true },
  });
  const sequence = latest ? Number.parseInt(latest.employeeId.replace(/\D/g, ""), 10) + 1 : 1;
  const employeeId = `EMP${String(Number.isFinite(sequence) ? sequence : 1).padStart(4, "0")}`;

  const temporaryPassword = `${employeeId}@${new Date().getFullYear()}`;
  const passwordHash = await hashPassword(temporaryPassword);

  let staffId: string;
  try {
    staffId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          schoolId: session.schoolId,
          email,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          phone: input.phone,
          passwordHash,
          mustChangePassword: true,
          status: "ACTIVE",
          roles: { connect: [{ id: role.id }] },
        },
      });
      const staff = await tx.staffMember.create({
        data: {
          schoolId: session.schoolId,
          userId: user.id,
          employeeId,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          email,
          phone: input.phone,
          staffType: input.staffType,
          employmentStatus: "ACTIVE",
          joiningDate: input.joiningDate ? new Date(input.joiningDate) : new Date(),
          qualification: input.qualification,
        },
      });
      return staff.id;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cors(NextResponse.json(
      {
        error: message.includes("Unique constraint")
          ? "That employee ID or email is already in use. Nothing was created."
          : `Could not create the staff member: ${message}`,
      },
      { status: 409 },
    ));
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "staff.create",
    entityType: "StaffMember",
    entityId: staffId,
    after: { employeeId, email, role: role.key, staffType: input.staffType, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    id: staffId,
    employeeId,
    message: `${input.firstName} added as ${employeeId}.`,
  }));
}
