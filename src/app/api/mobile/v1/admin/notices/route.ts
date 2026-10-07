import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/notices — notices with publish/pin state, to manage. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["notices.manage", "notices.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.notice.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: { id: true, title: true, audience: true, isPinned: true, publishedAt: true },
  });

  return cors(NextResponse.json({
    canManage: guard.permissions.includes("*") || guard.permissions.includes("notices.manage") || guard.permissions.includes("notices.*"),
    items: rows.map((n) => ({
      id: n.id,
      title: n.title,
      audience: (n.audience ?? []).join(", "),
      pinned: n.isPinned,
      published: n.publishedAt != null,
    })),
  }));
}

const Schema = z.object({
  noticeId: z.string().min(1),
  action: z.enum(["PUBLISH", "UNPUBLISH", "PIN", "UNPIN"]),
});

/** POST /api/mobile/v1/admin/notices — publish/unpublish/pin/unpin, like the web. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "notices.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { noticeId, action } = parsed.data;

  const db = scopedDb(session.schoolId);
  const notice = await db.notice.findUnique({ where: { id: noticeId }, select: { id: true, title: true } });
  if (!notice) return cors(NextResponse.json({ error: "Notice not found in your school." }, { status: 404 }));

  const data =
    action === "PUBLISH" ? { publishedAt: new Date() }
    : action === "UNPUBLISH" ? { publishedAt: null }
    : action === "PIN" ? { isPinned: true }
    : { isPinned: false };

  await db.notice.update({ where: { id: noticeId }, data });
  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "notices.update", entityType: "Notice", entityId: noticeId,
    after: { action, via: "mobile" },
  });

  const msg = {
    PUBLISH: "Notice published.",
    UNPUBLISH: "Notice unpublished.",
    PIN: "Notice pinned to the top.",
    UNPIN: "Notice unpinned.",
  }[action];
  return cors(NextResponse.json({ ok: true, message: msg }));
}
