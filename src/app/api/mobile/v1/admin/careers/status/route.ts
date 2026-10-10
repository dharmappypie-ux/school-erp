import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  id: z.string().min(1, "Missing the posting"),
  status: z.enum(["DRAFT", "OPEN", "CLOSED", "FILLED"]),
});

const MESSAGE: Record<z.infer<typeof Schema>["status"], string> = {
  DRAFT: "a draft",
  OPEN: "open for applications",
  CLOSED: "closed to new applications",
  FILLED: "marked as filled",
};

/**
 * POST /api/mobile/v1/admin/careers/status
 *
 * Mobile mirror of the web `setJobStatus` action: moves a post between draft,
 * open, closed and filled. The web form simply does nothing when the status is
 * already what was asked for; the app has a user waiting on a toast, so say so.
 *
 * `JobPosting` is absent from TENANT_MODELS in src/lib/tenant.ts, so `scopedDb`
 * injects no tenant clause for it — the lookup filters `schoolId` by hand, and
 * the update is keyed off the row that lookup proved belongs to this school.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "careers.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(
      NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      ),
    );
  }
  const { id, status } = parsed.data;

  const db = scopedDb(session.schoolId);
  const existing = await db.jobPosting.findFirst({
    where: { schoolId: session.schoolId, id },
    select: { id: true, reference: true, status: true, publishedAt: true },
  });

  if (!existing) {
    return cors(
      NextResponse.json({ error: "Posting not found in your school." }, { status: 404 }),
    );
  }
  if (existing.status === status) {
    return cors(
      NextResponse.json(
        { error: `${existing.reference} is already ${MESSAGE[status]}.` },
        { status: 409 },
      ),
    );
  }

  await db.jobPosting.update({
    where: { id: existing.id },
    data: {
      status,
      // First time it goes live, stamp the publication date and keep it.
      publishedAt:
        status === "OPEN" && existing.publishedAt === null
          ? new Date()
          : existing.publishedAt,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "careers.status",
    entityType: "JobPosting",
    entityId: existing.id,
    before: { status: existing.status },
    after: { status, via: "mobile" },
  });

  return cors(
    NextResponse.json({
      ok: true,
      message: `${existing.reference} is now ${MESSAGE[status]}.`,
    }),
  );
}
