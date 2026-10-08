import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";
import { isPlatformOwner, wouldOrphanSuperAdmin } from "@/lib/user-admin";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]) });

/** POST /api/mobile/v1/admin/users/[id]/status — activate/deactivate/suspend a login. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, "users.update");
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { status } = parsed.data;

  const db = scopedDb(session.schoolId);
  const user = await db.user.findUnique({ where: { id }, select: { id: true, firstName: true } });
  if (!user) return cors(NextResponse.json({ error: "User not found in your school." }, { status: 404 }));
  if (await isPlatformOwner(db, id)) {
    return cors(NextResponse.json({ error: "This account is a platform owner and cannot be edited here." }, { status: 403 }));
  }
  if (id === session.userId && status !== "ACTIVE") {
    return cors(NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 }));
  }
  if (status !== "ACTIVE") {
    const block = await wouldOrphanSuperAdmin(db, id);
    if (block) return cors(NextResponse.json({ error: block }, { status: 409 }));
  }

  await db.user.update({ where: { id }, data: { status } });
  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "users.status.change", entityType: "User", entityId: id, after: { status, via: "mobile" },
  });
  return cors(NextResponse.json({ ok: true, message: `${user.firstName}'s account is now ${status.toLowerCase()}.` }));
}
