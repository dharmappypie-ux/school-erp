"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { refreshRiskScores } from "@/lib/ai/risk";

export interface RefreshResult {
  ok: boolean;
  message: string;
}

export async function refreshInsights(): Promise<RefreshResult> {
  const session = await requirePermission("ai.insights");
  if (!session.academicYear) {
    return { ok: false, message: "Set a current academic year first." };
  }

  const started = Date.now();
  const { assessed, elevated } = await refreshRiskScores(
    session.schoolId,
    session.academicYear.id,
  );

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "ai.risk.refresh",
    entityType: "AcademicYear",
    entityId: session.academicYear.id,
    after: { assessed, elevated, durationMs: Date.now() - started },
  });

  revalidatePath("/insights");
  return {
    ok: true,
    message: `Scored ${assessed} students in ${((Date.now() - started) / 1000).toFixed(1)}s — ${elevated} at high or critical risk.`,
  };
}
