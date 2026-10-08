import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { hashPassword } from "@/lib/password";
import { scopedDb } from "@/lib/tenant";
import { isPlatformOwner, temporaryPassword } from "@/lib/user-admin";

export { OPTIONS } from "@/lib/mobile-auth";

/** POST /api/mobile/v1/admin/users/[id]/password — issue a new one-time password. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, "users.update");
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const db = scopedDb(session.schoolId);
  const user = await db.user.findUnique({ where: { id }, select: { id: true, firstName: true } });
  if (!user) return cors(NextResponse.json({ error: "User not found in your school." }, { status: 404 }));
  if (await isPlatformOwner(db, id)) {
    return cors(NextResponse.json({ error: "This account is a platform owner and cannot be edited here." }, { status: 403 }));
  }

  const password = temporaryPassword();
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "users.password.reset", entityType: "User", entityId: id, after: { via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `New one-time password for ${user.firstName}: ${password} — they must change it at next sign-in.`,
  }));
}
