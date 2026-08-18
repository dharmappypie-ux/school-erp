import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { hashSessionToken, readSessionToken } from "@/lib/session";
import {
  hasAnyPermission,
  hasPermission,
  type PermissionKey,
} from "@/lib/permissions";

export interface SessionContext {
  userId: string;
  schoolId: string;
  email: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  avatarUrl: string | null;
  mustChangePassword: boolean;

  roleKeys: string[];
  permissions: string[];

  school: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string;
    currency: string;
    timezone: string;
    settings: unknown;
  };

  /** Current academic year for this school, if one is marked current. */
  academicYear: { id: string; name: string; startDate: Date; endDate: Date } | null;

  /** Set when the user is themselves a student. */
  studentId: string | null;
  /** Set when the user is a staff member. */
  staffId: string | null;
  /** Set when the user is a guardian. */
  guardianId: string | null;
}

/**
 * Resolves the caller's session. Memoised per request via `React.cache`, so
 * multiple `requirePermission` calls in one render cost a single query.
 * Returns `null` for anonymous or expired sessions.
 */
export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const token = await readSessionToken();
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: {
        user: {
          include: {
            roles: true,
            school: true,
            student: { select: { id: true } },
            staff: { select: { id: true } },
            guardian: { select: { id: true } },
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    const { user } = session;
    if (user.status !== "ACTIVE" || user.deletedAt) return null;
    if (!user.school.isActive) return null;

    const academicYear = await prisma.academicYear.findFirst({
      where: { schoolId: user.schoolId, isCurrent: true },
      select: { id: true, name: true, startDate: true, endDate: true },
    });

    const permissions = [
      ...new Set(user.roles.flatMap((role) => role.permissions)),
    ];

    return {
      userId: user.id,
      schoolId: user.schoolId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(" "),
      avatarUrl: user.avatarUrl,
      mustChangePassword: user.mustChangePassword,
      roleKeys: user.roles.map((role) => role.key),
      permissions,
      school: {
        id: user.school.id,
        name: user.school.name,
        slug: user.school.slug,
        logoUrl: user.school.logoUrl,
        primaryColor: user.school.primaryColor,
        currency: user.school.currency,
        timezone: user.school.timezone,
        settings: user.school.settings,
      },
      academicYear,
      studentId: user.student?.id ?? null,
      staffId: user.staff?.id ?? null,
      guardianId: user.guardian?.id ?? null,
    };
  },
);

/** Session context or a redirect to the login page. */
export async function requireAuth(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  return context;
}

/** Session context, guaranteed to hold `permission`, or a redirect. */
export async function requirePermission(
  permission: PermissionKey | string,
): Promise<SessionContext> {
  const context = await requireAuth();
  if (!hasPermission(context.permissions, permission)) {
    redirect(`/forbidden?required=${encodeURIComponent(permission)}`);
  }
  return context;
}

/** Session context holding at least one of `permissions`, or a redirect. */
export async function requireAnyPermission(
  permissions: readonly string[],
): Promise<SessionContext> {
  const context = await requireAuth();
  if (!hasAnyPermission(context.permissions, permissions)) {
    redirect(`/forbidden?required=${encodeURIComponent(permissions.join(","))}`);
  }
  return context;
}

export async function can(
  permission: PermissionKey | string,
): Promise<boolean> {
  const context = await getSessionContext();
  return context ? hasPermission(context.permissions, permission) : false;
}

/**
 * Requires the current academic year to be set. Almost every academic query
 * needs it, and operating without one silently returns empty results.
 */
export async function requireAcademicYear(): Promise<
  SessionContext & { academicYear: NonNullable<SessionContext["academicYear"]> }
> {
  const context = await requireAuth();
  if (!context.academicYear) {
    redirect("/settings?setup=year-required");
  }
  return context as SessionContext & {
    academicYear: NonNullable<SessionContext["academicYear"]>;
  };
}
