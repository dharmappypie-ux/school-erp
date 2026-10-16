import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/roles
 *
 * Every role in the school with the permissions it grants, plus the whole
 * permission catalogue grouped by module — so the app's editor offers exactly
 * the keys the server knows, never a hard-coded copy that can fall behind.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["roles.manage", "users.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const roles = await db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true, key: true, name: true, description: true,
      permissions: true, isSystem: true,
      _count: { select: { users: true } },
    },
  });

  // Grouped by the module half of each `<module>.<action>` key. Platform
  // ownership is left out: it sits above any school and is refused on save, so
  // offering it here would only be a toggle that quietly does nothing.
  const catalogue = new Map<string, { key: string; label: string }[]>();
  for (const key of ALL_PERMISSIONS) {
    if (key === "platform.manage") continue;
    const moduleName = key.split(".")[0];
    const list = catalogue.get(moduleName) ?? [];
    list.push({ key, label: PERMISSIONS[key] });
    catalogue.set(moduleName, list);
  }

  return cors(NextResponse.json({
    roles: roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      users: r._count.users,
      permissions: r.permissions,
      /** `*` is "everything"; the editor shows it as such rather than as a key. */
      allAccess: r.permissions.includes("*"),
    })),
    catalogue: [...catalogue.entries()].map(([name, items]) => ({ module: name, items })),
  }));
}

const Body = z.object({
  roleId: z.string().min(1),
  permissions: z.array(z.string().min(1)).max(ALL_PERMISSIONS.length + 40),
});

/**
 * POST /api/mobile/v1/admin/roles
 *
 * Replaces one role's permission set. Only keys the server publishes are
 * accepted, plus the `"*"` and `"<module>.*"` wildcards it understands — an
 * unknown key would be dead weight that silently grants nothing.
 *
 * `platform.manage` can never be granted here: platform ownership sits above
 * any school, and a school admin must not be able to promote themselves into it.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "roles.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: "Send a roleId and a permissions list." }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const role = await db.role.findUnique({
    where: { id: parsed.data.roleId },
    select: { id: true, key: true, name: true, permissions: true, isSystem: true },
  });
  if (!role) {
    return cors(NextResponse.json({ error: "That role is not in your school." }, { status: 404 }));
  }
  if (role.key === "PLATFORM_ADMIN") {
    return cors(NextResponse.json(
      { error: "The platform owner's role is not edited from a school." },
      { status: 403 },
    ));
  }

  const known = new Set<string>(ALL_PERMISSIONS);
  const modules = new Set(ALL_PERMISSIONS.map((k) => k.split(".")[0]));
  const clean: string[] = [];
  for (const raw of parsed.data.permissions) {
    const value = raw.trim();
    if (value === "platform.manage") continue; // never grantable from a school
    if (value === "*") { clean.push("*"); continue; }
    if (value.endsWith(".*") && modules.has(value.slice(0, -2))) { clean.push(value); continue; }
    if (known.has(value)) clean.push(value);
  }
  const permissions = [...new Set(clean)].sort();

  if (permissions.length === 0) {
    return cors(NextResponse.json(
      { error: "A role with no permissions can't do anything — keep at least one." },
      { status: 400 },
    ));
  }

  await db.role.update({ where: { id: role.id }, data: { permissions } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "roles.permissions.update",
    entityType: "Role",
    entityId: role.id,
    before: { permissions: role.permissions },
    after: { permissions },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `${role.name} now grants ${permissions.includes("*") ? "everything" : `${permissions.length} permission(s)`}.`,
    permissions,
  }));
}
