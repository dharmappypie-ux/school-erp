import { NextResponse } from "next/server";

import { featuresFor, PLAN_LABEL } from "@/lib/entitlements";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/settings
 *
 * The school's own profile, its roles, its academic years and the tail of the
 * audit trail — the same read the web console's Settings page performs. The
 * halves that need more than `school.read` (users, audit) are gated
 * individually here too, so an account that may see the profile but not the
 * audit trail gets the profile rather than a 403.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "school.read");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const canAudit = hasPermission(session.permissions, "audit.read");

  const [school, roles, years, audit, userCount, studentCount, staffCount] =
    await Promise.all([
      db.school.findUnique({
        where: { id: session.schoolId },
        select: {
          name: true, slug: true, code: true, email: true, phone: true,
          addressLine1: true, city: true, state: true, currency: true,
          timezone: true, locale: true, isActive: true, createdAt: true,
          board: true, logoUrl: true, primaryColor: true,
        },
      }),
      db.role.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true, key: true, name: true, description: true,
          permissions: true, isSystem: true,
          _count: { select: { users: true } },
        },
      }),
      db.academicYear.findMany({
        orderBy: { startDate: "desc" },
        select: {
          id: true, name: true, startDate: true, endDate: true,
          isCurrent: true, isLocked: true,
          _count: { select: { sections: true } },
        },
      }),
      canAudit
        ? db.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true, action: true, entityType: true, createdAt: true,
              user: { select: { firstName: true, lastName: true } },
            },
          })
        : [],
      db.user.count({ where: { deletedAt: null } }),
      db.student.count({ where: { status: "ACTIVE" } }),
      db.staffMember.count({ where: { employmentStatus: "ACTIVE" } }),
    ]);

  if (!school) {
    return cors(NextResponse.json({ error: "School not found." }, { status: 404 }));
  }

  return cors(NextResponse.json({
    school: {
      ...school,
      createdAt: school.createdAt.toISOString(),
      plan: session.plan,
      planLabel: PLAN_LABEL[session.plan],
      features: featuresFor(session.plan),
      address: [school.addressLine1, school.city, school.state]
        .filter(Boolean)
        .join(", "),
    },
    counts: {
      users: userCount,
      students: studentCount,
      staff: staffCount,
      roles: roles.length,
      years: years.length,
    },
    roles: roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      users: r._count.users,
      permissionCount: r.permissions.includes("*") ? null : r.permissions.length,
    })),
    years: years.map((y) => ({
      id: y.id,
      name: y.name,
      startDate: y.startDate.toISOString(),
      endDate: y.endDate.toISOString(),
      isCurrent: y.isCurrent,
      isLocked: y.isLocked,
      sections: y._count.sections,
    })),
    audit: audit.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      at: a.createdAt.toISOString(),
      by: a.user ? `${a.user.firstName} ${a.user.lastName ?? ""}`.trim() : "System",
    })),
    canAudit,
    canManageUsers: hasPermission(session.permissions, "users.read"),
    canManageRoles: hasPermission(session.permissions, "roles.manage"),
    canManageYears: hasPermission(session.permissions, "academicyear.manage"),
  }));
}
