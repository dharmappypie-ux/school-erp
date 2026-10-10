import { NextResponse } from "next/server";

import { refreshRiskScores } from "@/lib/ai/risk";
import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * POST /api/mobile/v1/admin/insights/refresh — recompute dropout-risk scores for
 * the current year (deterministic, explainable model). Mirror of web refreshInsights.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "ai.insights", { feature: "ai_insights" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  if (!session.academicYearId) {
    return cors(NextResponse.json({ error: "Set a current academic year first." }, { status: 409 }));
  }

  const { assessed, elevated } = await refreshRiskScores(session.schoolId, session.academicYearId);

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "ai.risk.refresh", entityType: "AcademicYear", entityId: session.academicYearId,
    after: { assessed, elevated, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `Scored ${assessed} students — ${elevated} at high or critical risk.`,
  }));
}
