import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { hashPassword } from "@/lib/password";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";
import { temporaryPassword } from "@/lib/user-admin";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/users — users + assignable roles for management. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["users.read", "users.create", "roles.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const [users, roles] = await Promise.all([
    db.user.findMany({
      orderBy: { firstName: "asc" },
      take: 200,
      select: {
        id: true, firstName: true, lastName: true, email: true, status: true,
        roles: { select: { key: true, name: true } },
      },
    }),
    db.role.findMany({
      where: { key: { notIn: ["PLATFORM_ADMIN", "STUDENT", "PARENT"] } },
      orderBy: { name: "asc" },
      select: { key: true, name: true },
    }),
  ]);

  return cors(NextResponse.json({
    canManageRoles: guard.permissions.includes("*") || guard.permissions.includes("roles.manage") || guard.permissions.includes("roles.*"),
    roles: roles.map((r) => ({ key: r.key, name: r.name })),
    items: users
      .filter((u) => !u.roles.some((r) => r.key === "PLATFORM_ADMIN"))
      .map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName ?? ""}`.trim(),
        email: u.email,
        status: u.status,
        role: u.roles[0]?.name ?? "—",
        roleKey: u.roles[0]?.key ?? "",
        isSelf: u.id === session.userId,
      })),
  }));
}

const Schema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email("A valid email is required for the login"),
  phone: z.string().trim().max(20).optional(),
  roleKey: z.string().trim().min(1, "Choose a role"),
});

/** POST /api/mobile/v1/admin/users — create a login with a one-time password. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "users.create");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { firstName, lastName, email, phone, roleKey } = parsed.data;

  if (roleKey === "PLATFORM_ADMIN") {
    return cors(NextResponse.json({ error: "That role cannot be assigned from a school." }, { status: 403 }));
  }
  if (roleKey === "SUPER_ADMIN" && !hasPermission(session.permissions, "roles.manage")) {
    return cors(NextResponse.json({ error: "Assigning the super admin role needs the roles.manage permission." }, { status: 403 }));
  }

  const db = scopedDb(session.schoolId);
  const clash = await db.user.findFirst({ where: { email }, select: { id: true } });
  if (clash) return cors(NextResponse.json({ error: "A user with that email already exists." }, { status: 409 }));

  const role = await db.role.findUnique({
    where: { schoolId_key: { schoolId: session.schoolId, key: roleKey } },
    select: { id: true, name: true },
  });
  if (!role) return cors(NextResponse.json({ error: "That role does not exist." }, { status: 404 }));

  const password = temporaryPassword();
  const user = await db.user.create({
    data: {
      schoolId: session.schoolId, email, firstName, lastName: lastName || null, phone: phone || null,
      passwordHash: await hashPassword(password), mustChangePassword: true, status: "ACTIVE",
      roles: { connect: [{ id: role.id }] },
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "users.create", entityType: "User", entityId: user.id,
    after: { email, roleKey, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `${firstName} added as ${role.name}. One-time password: ${password} — they must change it at first sign-in.`,
  }));
}
