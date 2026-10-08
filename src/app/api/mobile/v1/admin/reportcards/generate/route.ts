import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { generateReportCards } from "@/lib/grading";
import { cors, requireMobile } from "@/lib/mobile-auth";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  termId: z.string().min(1),
  sectionId: z.string().min(1),
});

/**
 * POST /api/mobile/v1/admin/reportcards/generate
 *
 * Generates (recomputes) report cards for a term × section from recorded marks,
 * mirroring the web `generateCards`. Gated on reportcards.generate.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "reportcards.generate");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  if (!session.academicYearId) {
    return cors(NextResponse.json({ error: "No academic year is marked current." }, { status: 409 }));
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: "Choose a term and a class." }, { status: 400 }));
  }

  const result = await generateReportCards({
    schoolId: session.schoolId,
    academicYearId: session.academicYearId,
    termId: parsed.data.termId,
    sectionId: parsed.data.sectionId,
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "reportcards.generate", entityType: "ExamTerm", entityId: parsed.data.termId,
    after: { sectionId: parsed.data.sectionId, ...result, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: result.generated > 0, ...result }));
}
