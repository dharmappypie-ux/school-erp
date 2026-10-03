"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

type Db = ReturnType<typeof scopedDb>;

/** A readable one-time password the admin can pass on, e.g. "Vidya-7F3K9Q". */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `Vidya-${suffix}`;
}

/**
 * A school must never be left with zero super admins. Returns a blocking
 * message when `userId` is the last active SUPER_ADMIN and the pending change
 * would remove that access; null when the change is safe.
 */
async function wouldOrphanSuperAdmin(db: Db, userId: string): Promise<string | null> {
  const isAdmin = await db.user.findFirst({
    where: { id: userId, roles: { some: { key: "SUPER_ADMIN" } } },
    select: { id: true },
  });
  if (!isAdmin) return null;

  const otherAdmins = await db.user.count({
    where: {
      status: "ACTIVE",
      roles: { some: { key: "SUPER_ADMIN" } },
      NOT: { id: userId },
    },
  });
  if (otherAdmins === 0) {
    return "This is the school's only super admin. Promote another user to super admin first.";
  }
  return null;
}

/**
 * A platform owner's account must not be editable from a school's admin screens
 * — a school admin could otherwise strip the PLATFORM_ADMIN role (the `set`
 * replaces the whole role set), reset its password, or lock it out.
 */
async function isPlatformOwner(db: Db, userId: string): Promise<boolean> {
  const hit = await db.user.findFirst({
    where: { id: userId, roles: { some: { key: "PLATFORM_ADMIN" } } },
    select: { id: true },
  });
  return Boolean(hit);
}

const CreateUserSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email("A valid email is required for the login"),
  phone: z.string().trim().max(20).optional(),
  roleKey: z.string().trim().min(1, "Choose a role"),
});

/**
 * Creates a standalone login (no staff or student record) and returns a
 * one-time password for the admin to hand over. The account must change its
 * password on first sign-in.
 */
export async function createUser(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("users.create");
  const db = scopedDb(session.schoolId);
  const { firstName, lastName, email, phone, roleKey } = parsed.data;

  if (roleKey === "PLATFORM_ADMIN") {
    return { ok: false, message: "That role cannot be assigned from a school.", values: raw };
  }

  // Minting a super admin is a privilege escalation: creating a login
  // (users.create) must not be a back door around role management. Assigning
  // the SUPER_ADMIN role therefore requires roles.manage as well.
  if (roleKey === "SUPER_ADMIN" && !hasPermission(session.permissions, "roles.manage")) {
    return {
      ok: false,
      message: "Assigning the super admin role needs the roles.manage permission.",
      values: raw,
    };
  }

  const clash = await db.user.findFirst({ where: { email }, select: { id: true } });
  if (clash) {
    return { ok: false, message: "Another user already has that email.", values: raw };
  }

  const role = await db.role.findUnique({
    where: { schoolId_key: { schoolId: session.schoolId, key: roleKey } },
    select: { id: true, name: true },
  });
  if (!role) return { ok: false, message: "That role does not exist.", values: raw };

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  const user = await db.user.create({
    data: {
      schoolId: session.schoolId,
      email,
      firstName,
      lastName: lastName || null,
      phone: phone || null,
      passwordHash,
      mustChangePassword: true,
      status: "ACTIVE",
      roles: { connect: [{ id: role.id }] },
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "users.create",
    entityType: "User",
    entityId: user.id,
    after: { email, roleKey },
  });

  revalidatePath("/settings/users");
  return {
    ok: true,
    message: `${firstName} added as ${role.name}. One-time password: ${password} — they must change it at first sign-in.`,
  };
}

/** Replaces a user's role set with a single role. */
export async function changeUserRole(userId: string, roleKey: string): Promise<ActionResult> {
  const session = await requirePermission("roles.manage");
  const db = scopedDb(session.schoolId);

  if (roleKey === "PLATFORM_ADMIN") {
    return { ok: false, message: "That role cannot be assigned from a school." };
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true } });
  if (!user) return { ok: false, message: "User not found in your school." };
  if (await isPlatformOwner(db, userId)) {
    return { ok: false, message: "This account is a platform owner and cannot be edited here." };
  }

  const role = await db.role.findUnique({
    where: { schoolId_key: { schoolId: session.schoolId, key: roleKey } },
    select: { id: true, name: true },
  });
  if (!role) return { ok: false, message: "That role does not exist." };

  if (roleKey !== "SUPER_ADMIN") {
    const block = await wouldOrphanSuperAdmin(db, userId);
    if (block) return { ok: false, message: block };
  }

  await db.user.update({ where: { id: userId }, data: { roles: { set: [{ id: role.id }] } } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "users.role.change",
    entityType: "User",
    entityId: userId,
    after: { roleKey },
  });

  revalidatePath("/settings/users");
  return { ok: true, message: `${user.firstName} is now ${role.name}.` };
}

/** Issues a fresh one-time password and forces a change at next sign-in. */
export async function resetUserPassword(userId: string): Promise<ActionResult> {
  const session = await requirePermission("users.update");
  const db = scopedDb(session.schoolId);

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true } });
  if (!user) return { ok: false, message: "User not found in your school." };
  if (await isPlatformOwner(db, userId)) {
    return { ok: false, message: "This account is a platform owner and cannot be edited here." };
  }

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "users.password.reset",
    entityType: "User",
    entityId: userId,
  });

  revalidatePath("/settings/users");
  return {
    ok: true,
    message: `New one-time password for ${user.firstName}: ${password} — they must change it at next sign-in.`,
  };
}

const STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

/** Activates, deactivates or suspends a login. */
export async function setUserStatus(
  userId: string,
  status: (typeof STATUSES)[number],
): Promise<ActionResult> {
  if (!STATUSES.includes(status)) return { ok: false, message: "Unknown status." };

  const session = await requirePermission("users.update");
  const db = scopedDb(session.schoolId);

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true } });
  if (!user) return { ok: false, message: "User not found in your school." };
  if (await isPlatformOwner(db, userId)) {
    return { ok: false, message: "This account is a platform owner and cannot be edited here." };
  }

  if (userId === session.userId && status !== "ACTIVE") {
    return { ok: false, message: "You cannot deactivate your own account." };
  }
  if (status !== "ACTIVE") {
    const block = await wouldOrphanSuperAdmin(db, userId);
    if (block) return { ok: false, message: block };
  }

  await db.user.update({ where: { id: userId }, data: { status } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "users.status.change",
    entityType: "User",
    entityId: userId,
    after: { status },
  });

  revalidatePath("/settings/users");
  return { ok: true, message: `${user.firstName}'s account is now ${status.toLowerCase()}.` };
}
