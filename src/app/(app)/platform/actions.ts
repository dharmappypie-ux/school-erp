"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ALL_PLANS, PLAN_LABEL } from "@/lib/entitlements";
import { SubscriptionPlan } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/password";
import { PLATFORM_WORKSPACE_SLUG, ROLE_PRESETS } from "@/lib/permissions";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `Vidya-${suffix}`;
}

/**
 * Loads a real school by id for cross-tenant admin management. Refuses the
 * hidden platform workspace so its owner accounts are never manageable as if
 * they were a school's admins.
 */
async function loadManagedSchool(schoolId: string) {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, slug: { not: PLATFORM_WORKSPACE_SLUG } },
    select: { id: true, name: true },
  });
  return school;
}

const ADMIN_ROLE_KEYS = ["SUPER_ADMIN", "ADMIN"] as const;

/** Active super admins in a school, used to keep at least one at all times. */
async function activeSuperAdminCount(schoolId: string, excludeUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      schoolId,
      status: "ACTIVE",
      roles: { some: { key: "SUPER_ADMIN" } },
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
  });
}

const SchoolSchema = z
  .object({
    name: z.string().trim().min(2, "A school name is required").max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .max(40)
      .optional()
      .transform((value) => (value ? value.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") : "")),
    code: z.string().trim().max(20).optional(),
    board: z.string().trim().max(40).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    currency: z.string().trim().max(8).optional(),
    yearName: z.string().trim().min(4, "An academic year name is required, e.g. 2026-27").max(20),
    yearStart: z.string().min(1, "A start date is required"),
    yearEnd: z.string().min(1, "An end date is required"),
    adminFirstName: z.string().trim().min(1, "The admin's first name is required").max(80),
    adminLastName: z.string().trim().max(80).optional(),
    adminEmail: z.string().trim().toLowerCase().email("A valid admin email is required"),
  })
  .refine((data) => !Number.isNaN(new Date(data.yearStart).getTime()), {
    message: "The year start date could not be read",
    path: ["yearStart"],
  })
  .refine((data) => !Number.isNaN(new Date(data.yearEnd).getTime()), {
    message: "The year end date could not be read",
    path: ["yearEnd"],
  })
  .refine((data) => new Date(data.yearEnd) > new Date(data.yearStart), {
    message: "The year must end after it starts",
    path: ["yearEnd"],
  });

/**
 * Provisions a whole new tenant: the school, its full set of system roles, a
 * current academic year, and a first super-admin login with a one-time
 * password. Runs as raw (un-scoped) Prisma on purpose — `scopedDb` binds to the
 * caller's own school, which is exactly what tenant creation must not do. The
 * whole thing is one transaction so a half-created school is impossible.
 *
 * Gated on the platform-owner role, never on a per-school permission.
 */
export async function createSchool(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = SchoolSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePlatformAdmin();
  const data = parsed.data;

  const slug = (data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(
    /^-+|-+$/g,
    "",
  );
  if (!slug) {
    return { ok: false, message: "Could not derive a URL slug from that name.", values: raw };
  }

  const slugClash = await prisma.school.findUnique({ where: { slug }, select: { id: true } });
  if (slugClash) {
    return { ok: false, message: `A school with the slug "${slug}" already exists.`, values: raw };
  }

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  let adminEmail = "";
  try {
    adminEmail = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          slug,
          name: data.name,
          code: data.code || null,
          board: data.board || null,
          city: data.city || null,
          state: data.state || null,
          currency: data.currency || "INR",
          email: data.adminEmail,
          plan: "TRIAL",
        },
        select: { id: true },
      });

      // Every school gets the full set of system roles.
      const roleIdByKey = new Map<string, string>();
      for (const preset of ROLE_PRESETS) {
        const role = await tx.role.create({
          data: {
            schoolId: school.id,
            key: preset.key,
            name: preset.name,
            description: preset.description,
            permissions: preset.permissions,
            isSystem: true,
          },
          select: { id: true, key: true },
        });
        roleIdByKey.set(role.key, role.id);
      }

      await tx.academicYear.create({
        data: {
          schoolId: school.id,
          name: data.yearName,
          startDate: new Date(data.yearStart),
          endDate: new Date(data.yearEnd),
          isCurrent: true,
        },
      });

      await tx.user.create({
        data: {
          schoolId: school.id,
          email: data.adminEmail,
          firstName: data.adminFirstName,
          lastName: data.adminLastName || null,
          passwordHash,
          mustChangePassword: true,
          status: "ACTIVE",
          roles: { connect: [{ id: roleIdByKey.get("SUPER_ADMIN")! }] },
        },
      });

      return data.adminEmail;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Could not create the school: ${message}`, values: raw };
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "platform.school.create",
    entityType: "School",
    entityId: slug,
    after: { name: data.name, slug, adminEmail },
  });

  revalidatePath("/platform");
  return {
    ok: true,
    message: `"${data.name}" created. First admin: ${adminEmail} — one-time password: ${password} (they must change it at first sign-in).`,
  };
}

/* -------------------------------------------------------------------------- */
/* Cross-school admin management                                               */
/* -------------------------------------------------------------------------- */

const AddAdminSchema = z.object({
  schoolId: z.string().min(1),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  roleKey: z.enum(ADMIN_ROLE_KEYS),
});

/** Adds an administrator (super admin or admin) to a school. */
export async function addSchoolAdmin(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = AddAdminSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePlatformAdmin();
  const { schoolId, firstName, lastName, email, roleKey } = parsed.data;

  const school = await loadManagedSchool(schoolId);
  if (!school) return { ok: false, message: "That school does not exist.", values: raw };

  const clash = await prisma.user.findFirst({
    where: { schoolId, email },
    select: { id: true },
  });
  if (clash) {
    return { ok: false, message: "A user with that email already exists in this school.", values: raw };
  }

  const role = await prisma.role.findUnique({
    where: { schoolId_key: { schoolId, key: roleKey } },
    select: { id: true, name: true },
  });
  if (!role) return { ok: false, message: `This school has no ${roleKey} role.`, values: raw };

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      schoolId,
      email,
      firstName,
      lastName: lastName || null,
      passwordHash,
      mustChangePassword: true,
      status: "ACTIVE",
      roles: { connect: [{ id: role.id }] },
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "platform.admin.add",
    entityType: "School",
    entityId: schoolId,
    after: { email, roleKey },
  });

  revalidatePath(`/platform/${schoolId}`);
  return {
    ok: true,
    message: `${firstName} added as ${role.name} of ${school.name}. One-time password: ${password}.`,
  };
}

type SchoolUser = {
  id: string;
  firstName: string;
  status: string;
  roles: { key: string }[];
};

/** Loads and validates that a target user is a manageable admin of a school. */
async function loadSchoolUser(
  schoolId: string,
  userId: string,
): Promise<{ ok: true; user: SchoolUser } | { ok: false; message: string }> {
  const school = await loadManagedSchool(schoolId);
  if (!school) return { ok: false, message: "That school does not exist." };
  const user = await prisma.user.findFirst({
    where: { id: userId, schoolId },
    select: { id: true, firstName: true, status: true, roles: { select: { key: true } } },
  });
  if (!user) return { ok: false, message: "That user is not in this school." };
  if (user.roles.some((role) => role.key === "PLATFORM_ADMIN")) {
    return { ok: false, message: "Platform owners are not managed here." };
  }
  return { ok: true, user };
}

/** Switches an admin between SUPER_ADMIN and ADMIN. */
export async function setSchoolAdminRole(
  schoolId: string,
  userId: string,
  roleKey: (typeof ADMIN_ROLE_KEYS)[number],
): Promise<ActionResult> {
  if (!ADMIN_ROLE_KEYS.includes(roleKey)) return { ok: false, message: "Unknown role." };
  const session = await requirePlatformAdmin();

  const loaded = await loadSchoolUser(schoolId, userId);
  if (!loaded.ok) return { ok: false, message: loaded.message };
  const { user } = loaded;

  const role = await prisma.role.findUnique({
    where: { schoolId_key: { schoolId, key: roleKey } },
    select: { id: true, name: true },
  });
  if (!role) return { ok: false, message: `This school has no ${roleKey} role.` };

  // Demoting the last active super admin would leave the school unmanageable.
  const isSuper = user.roles.some((r) => r.key === "SUPER_ADMIN");
  if (isSuper && roleKey !== "SUPER_ADMIN") {
    if ((await activeSuperAdminCount(schoolId, userId)) === 0) {
      return { ok: false, message: "This is the school's only super admin — add another first." };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { roles: { set: [{ id: role.id }] } } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "platform.admin.role",
    entityType: "User",
    entityId: userId,
    after: { schoolId, roleKey },
  });

  revalidatePath(`/platform/${schoolId}`);
  return { ok: true, message: `${user.firstName} is now ${role.name}.` };
}

/** Issues a fresh one-time password for a school admin. */
export async function resetSchoolAdminPassword(
  schoolId: string,
  userId: string,
): Promise<ActionResult> {
  const session = await requirePlatformAdmin();

  const loaded = await loadSchoolUser(schoolId, userId);
  if (!loaded.ok) return { ok: false, message: loaded.message };

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "platform.admin.reset",
    entityType: "User",
    entityId: userId,
    after: { schoolId },
  });

  revalidatePath(`/platform/${schoolId}`);
  return {
    ok: true,
    message: `New one-time password for ${loaded.user.firstName}: ${password}.`,
  };
}

/** Changes a school's subscription plan, which gates its optional features. */
export async function setSchoolPlan(
  schoolId: string,
  plan: SubscriptionPlan,
): Promise<ActionResult> {
  if (!(ALL_PLANS as string[]).includes(plan)) {
    return { ok: false, message: "Unknown plan." };
  }
  const session = await requirePlatformAdmin();

  const school = await loadManagedSchool(schoolId);
  if (!school) return { ok: false, message: "That school does not exist." };

  const before = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { plan: true },
  });
  await prisma.school.update({ where: { id: schoolId }, data: { plan } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "platform.school.plan",
    entityType: "School",
    entityId: schoolId,
    before: { plan: before?.plan },
    after: { plan },
  });

  revalidatePath(`/platform/${schoolId}`);
  revalidatePath("/platform");
  return { ok: true, message: `${school.name} is now on the ${PLAN_LABEL[plan]} plan.` };
}

const ADMIN_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

/** Activates, deactivates or suspends a school admin. */
export async function setSchoolAdminStatus(
  schoolId: string,
  userId: string,
  status: (typeof ADMIN_STATUSES)[number],
): Promise<ActionResult> {
  if (!ADMIN_STATUSES.includes(status)) return { ok: false, message: "Unknown status." };
  const session = await requirePlatformAdmin();

  const loaded = await loadSchoolUser(schoolId, userId);
  if (!loaded.ok) return { ok: false, message: loaded.message };
  const { user } = loaded;

  const isSuper = user.roles.some((r) => r.key === "SUPER_ADMIN");
  if (isSuper && status !== "ACTIVE") {
    if ((await activeSuperAdminCount(schoolId, userId)) === 0) {
      return { ok: false, message: "This is the school's only active super admin — add another first." };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { status } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "platform.admin.status",
    entityType: "User",
    entityId: userId,
    after: { schoolId, status },
  });

  revalidatePath(`/platform/${schoolId}`);
  return { ok: true, message: `${user.firstName}'s account is now ${status.toLowerCase()}.` };
}
