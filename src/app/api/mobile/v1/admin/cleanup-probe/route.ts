import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** POST /api/mobile/v1/admin/cleanup-probe — TEMPORARY. Removes the verification
 * student(s) created while testing the create-student fix, plus their logins.
 * Super-admin only. Remove after running. */
export async function POST(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  if (!session.permissions.includes("*")) {
    return cors(NextResponse.json({ error: "Super admin only." }, { status: 403 }));
  }
  const db = scopedDb(session.schoolId);
  const studs = await db.student.findMany({
    where: { firstName: { in: ["VerifyFix", "Reproduce", "ZZTEST"] } },
    select: { id: true, email: true, guardians: { select: { guardian: { select: { id: true, user: { select: { email: true } } } } } } },
  });
  const emails = new Set<string>();
  const gids = new Set<string>();
  for (const s of studs) {
    if (s.email) emails.add(s.email);
    for (const g of s.guardians) { gids.add(g.guardian.id); if (g.guardian.user?.email) emails.add(g.guardian.user.email); }
  }
  const del = studs.length ? await db.student.deleteMany({ where: { id: { in: studs.map((s) => s.id) } } }) : { count: 0 };
  if (gids.size) await db.guardian.deleteMany({ where: { id: { in: [...gids] }, students: { none: {} } } }).catch(() => undefined);
  if (emails.size) await db.user.deleteMany({ where: { email: { in: [...emails] } } }).catch(() => undefined);
  return cors(NextResponse.json({ ok: true, deletedStudents: del.count, deletedLogins: emails.size }));
}
