import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  name: z.string().trim().min(1, "Give the subject a name").max(120),
  code: z.string().trim().min(1, "Give the subject a code").max(24),
  isElective: z.boolean().optional(),
  isCoScholastic: z.boolean().optional(),
  isGraded: z.boolean().optional(),
});

/** POST /api/mobile/v1/admin/subject — create a subject. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "academics.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const code = parsed.data.code.toUpperCase();
  const existing = await db.subject.findFirst({ where: { code }, select: { id: true } });
  if (existing) {
    return cors(NextResponse.json({ error: `A subject with code ${code} already exists.` }, { status: 409 }));
  }

  try {
    const subject = await db.subject.create({
      data: {
        schoolId: session.schoolId,
        name: parsed.data.name,
        code,
        isElective: parsed.data.isElective ?? false,
        isCoScholastic: parsed.data.isCoScholastic ?? false,
        isGraded: parsed.data.isGraded ?? true,
      },
      select: { id: true, name: true },
    });
    await recordAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: "academics.subject.create", entityType: "Subject", entityId: subject.id,
      after: { name: subject.name, code, via: "mobile" },
    });
    return cors(NextResponse.json({ ok: true, id: subject.id, message: `Subject “${subject.name}” (${code}) created.` }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return cors(NextResponse.json(
      { error: msg.includes("Unique constraint") ? `Code ${code} is already in use.` : `Could not create the subject: ${msg}` },
      { status: 409 },
    ));
  }
}
