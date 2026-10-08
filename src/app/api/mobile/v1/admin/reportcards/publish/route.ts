import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ cardId: z.string().min(1), publish: z.boolean() });

/** POST /api/mobile/v1/admin/reportcards/publish — publish or unpublish a card. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "reportcards.publish");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const card = await db.reportCard.findUnique({
    where: { id: parsed.data.cardId },
    select: { id: true, student: { select: { firstName: true } } },
  });
  if (!card) return cors(NextResponse.json({ error: "Report card not found in your school." }, { status: 404 }));

  await db.reportCard.update({
    where: { id: card.id },
    data: { isPublished: parsed.data.publish, publishedAt: parsed.data.publish ? new Date() : null },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: parsed.data.publish ? "reportcards.publish" : "reportcards.unpublish",
    entityType: "ReportCard", entityId: card.id, after: { via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `${card.student.firstName}'s report card ${parsed.data.publish ? "published" : "unpublished"}.`,
  }));
}
