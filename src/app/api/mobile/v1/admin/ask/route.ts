import { NextResponse } from "next/server";
import { z } from "zod";

import { runAsk } from "@/lib/ask";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ question: z.string() });

/**
 * POST /api/mobile/v1/admin/ask — natural-language query over the school's data.
 * Mirror of the web `askQuestion`, via the shared lib so the two stay identical.
 * Gated on ai.query; rate-limited and logged per school/user inside the lib.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "ai.query", { feature: "ask_ai" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ ok: false, explanation: "Ask a question.", usedAi: false }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const result = await runAsk({
    db,
    schoolId: session.schoolId,
    userId: session.userId,
    permissions: session.permissions,
    question: parsed.data.question,
  });

  // Always 200 — the body carries `ok` + `explanation`, so a non-answerable
  // question still returns its reason rather than an error status.
  return cors(NextResponse.json(result));
}
