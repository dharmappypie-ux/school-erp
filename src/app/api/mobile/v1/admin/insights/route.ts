import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/insights?level=
 *
 * Dropout-risk insights: students scored MEDIUM/HIGH/CRITICAL (or a specific
 * level), with the per-signal factors behind each score, plus the count by
 * level. Mirror of the web /insights page.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["ai.insights", "analytics.read"], { feature: "ai_insights" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  const level = new URL(req.url).searchParams.get("level");

  if (!yearId) return cors(NextResponse.json({ items: [], countByLevel: {}, totalScored: 0, lastComputed: null }));

  const validLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const levelWhere = level && validLevels.includes(level)
    ? { level: level as "LOW" }
    : { level: { in: ["MEDIUM", "HIGH", "CRITICAL"] as ("MEDIUM" | "HIGH" | "CRITICAL")[] } };

  const [scores, counts] = await Promise.all([
    db.riskScore.findMany({
      where: { academicYearId: yearId, kind: "DROPOUT", ...levelWhere },
      orderBy: { score: "desc" },
      take: 50,
      select: {
        score: true, level: true, factors: true, computedAt: true,
        student: {
          select: {
            id: true, firstName: true, lastName: true, admissionNo: true,
            enrollments: {
              where: { academicYearId: yearId }, take: 1,
              select: { section: { select: { name: true, classLevel: { select: { name: true } } } } },
            },
          },
        },
      },
    }),
    db.riskScore.groupBy({ by: ["level"], where: { academicYearId: yearId, kind: "DROPOUT" }, _count: { _all: true } }),
  ]);

  const countByLevel: Record<string, number> = {};
  for (const c of counts) countByLevel[c.level] = c._count._all;

  const canRefresh = guard.permissions.includes("*") ||
    guard.permissions.includes("ai.insights") || guard.permissions.includes("ai.*");

  return cors(NextResponse.json({
    canRefresh,
    totalScored: counts.reduce((s, c) => s + c._count._all, 0),
    countByLevel,
    lastComputed: scores[0]?.computedAt?.toISOString() ?? null,
    items: scores.map((s) => {
      const sec = s.student.enrollments[0]?.section;
      const factors = (s.factors && typeof s.factors === "object" && !Array.isArray(s.factors))
        ? Object.entries(s.factors as Record<string, unknown>)
            .map(([k, v]) => ({ signal: k, value: typeof v === "number" ? Math.round(v * 10) / 10 : v }))
            .filter((f) => typeof f.value === "number" && (f.value as number) > 0)
            .sort((a, b) => (b.value as number) - (a.value as number))
            .slice(0, 4)
        : [];
      return {
        studentId: s.student.id,
        name: `${s.student.firstName} ${s.student.lastName ?? ""}`.trim(),
        admissionNo: s.student.admissionNo,
        className: sec ? `${sec.classLevel.name} · ${sec.name}` : null,
        score: toNumber(s.score),
        level: s.level,
        factors,
      };
    }),
  }));
}
