import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ id: z.string().trim().min(1, "Missing the note") });

/**
 * POST /api/mobile/v1/admin/behaviour/retract
 *
 * Flags the note rather than deleting it, as the web action does: a note a
 * parent has already been shown cannot be made never to have existed, and an
 * audit of the ledger needs to see that someone withdrew it.
 *
 * `schoolId` is filtered by hand because BehaviourLog is not registered in
 * TENANT_MODELS — see the note in ../route.ts.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "behaviour.manage");
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

  const db = scopedDb(session.schoolId);
  const existing = await db.behaviourLog.findFirst({
    where: { id: parsed.data.id, schoolId: session.schoolId },
    select: { id: true, summary: true, retractedAt: true },
  });

  if (!existing) {
    return cors(
      NextResponse.json({ error: "Note not found in your school." }, { status: 404 }),
    );
  }
  if (existing.retractedAt) {
    return cors(
      NextResponse.json({ error: "That note was already retracted." }, { status: 409 }),
    );
  }

  await db.behaviourLog.update({
    where: { id: existing.id },
    data: { retractedAt: new Date(), retractedBy: session.userId },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "behaviour.retract",
    entityType: "BehaviourLog",
    entityId: existing.id,
    before: { summary: existing.summary },
    after: { via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: "Note retracted." }));
}
