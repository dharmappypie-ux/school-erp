import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const AUDIENCES = ["ALL", "STUDENTS", "PARENTS", "STAFF"] as const;

const Schema = z.object({
  title: z.string().trim().min(3, "Give the notice a title").max(200),
  body: z.string().trim().min(3, "Write the notice").max(8000),
  audience: z.array(z.enum(AUDIENCES)).min(1).optional(),
  isPinned: z.boolean().optional(),
  publishNow: z.boolean().optional(),
});

/**
 * POST /api/mobile/v1/admin/notice
 *
 * Publish (or draft) a school notice to a chosen audience — the mobile mirror
 * of the web `createNotice` action.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "notices.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    ));
  }
  const input = parsed.data;
  const db = scopedDb(session.schoolId);
  const publish = input.publishNow !== false; // default: publish immediately

  const notice = await db.notice.create({
    data: {
      schoolId: session.schoolId,
      title: input.title,
      body: input.body,
      audience: input.audience ?? ["ALL"],
      authorId: session.userId,
      isPinned: input.isPinned ?? false,
      publishedAt: publish ? new Date() : null,
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "notices.create",
    entityType: "Notice",
    entityId: notice.id,
    after: { title: notice.title, published: publish, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    id: notice.id,
    message: publish ? `“${notice.title}” published.` : `“${notice.title}” saved as draft.`,
  }));
}
