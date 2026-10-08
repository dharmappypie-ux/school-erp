import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";
import { isPlatformOwner, wouldOrphanSuperAdmin } from "@/lib/user-admin";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ roleKey: z.string().trim().min(1, "Choose a role") });

/** POST /api/mobile/v1/admin/users/[id]/role — change a user's role (web parity). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, "roles.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { roleKey } = parsed.data;
  if (roleKey === "PLATFORM_ADMIN") {
    return cors(NextResponse.json({ error: "That role cannot be assigned from a school." }, { status: 403 }));
  }

  const db = scopedDb(session.schoolId);
  const user = await db.user.findUnique({ where: { id }, select: { id: true, firstName: true } });
  if (!user) return cors(NextResponse.json({ error: "User not found in your school." }, { status: 404 }));
  if (await isPlatformOwner(db, id)) {
    return cors(NextResponse.json({ error: "This account is a platform owner and cannot be edited here." }, { status: 403 }));
  }

  const role = await db.role.findUnique({
    where: { schoolId_key: { schoolId: session.schoolId, key: roleKey } },
    select: { id: true, name: true },
  });
  if (!role) return cors(NextResponse.json({ error: "That role does not exist." }, { status: 404 }));

  if (roleKey !== "SUPER_ADMIN") {
    const block = await wouldOrphanSuperAdmin(db, id);
    if (block) return cors(NextResponse.json({ error: block }, { status: 409 }));
  }

  await db.user.update({ where: { id }, data: { roles: { set: [{ id: role.id }] } } });
  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "users.role.change", entityType: "User", entityId: id, after: { roleKey, via: "mobile" },
  });
  return cors(NextResponse.json({ ok: true, message: `${user.firstName} is now ${role.name}.` }));
}
