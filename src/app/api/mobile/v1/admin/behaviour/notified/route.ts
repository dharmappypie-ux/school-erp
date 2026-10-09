import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ id: z.string().trim().min(1, "Missing the note") });

/**
 * POST /api/mobile/v1/admin/behaviour/notified
 *
 * Marks the guardian as informed, so the follow-up queue empties.
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
    select: {
      id: true,
      retractedAt: true,
      guardianNotifiedAt: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  if (!existing) {
    return cors(
      NextResponse.json({ error: "Note not found in your school." }, { status: 404 }),
    );
  }
  if (existing.retractedAt) {
    return cors(
      NextResponse.json(
        { error: "That note was retracted — there is nothing to tell the guardian." },
        { status: 409 },
      ),
    );
  }
  if (existing.guardianNotifiedAt) {
    return cors(
      NextResponse.json(
        { error: "The guardian was already marked as told." },
        { status: 409 },
      ),
    );
  }

  await db.behaviourLog.update({
    where: { id: existing.id },
    data: { guardianNotifiedAt: new Date() },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "behaviour.notified",
    entityType: "BehaviourLog",
    entityId: existing.id,
    after: { via: "mobile" },
  });

  const name = `${existing.student.firstName} ${existing.student.lastName ?? ""}`.trim();
  return cors(
    NextResponse.json({ ok: true, message: `Guardian of ${name} marked as told.` }),
  );
}
