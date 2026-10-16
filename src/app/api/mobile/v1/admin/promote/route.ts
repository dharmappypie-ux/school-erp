import { NextResponse } from "next/server";
import { z } from "zod";

import { cors, requireMobile } from "@/lib/mobile-auth";
import {
  OUTCOMES,
  promotableSections,
  promoteSection,
  promotionRoster,
  type Outcome,
} from "@/lib/promotion";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/promote?sectionId=…
 *
 * The classes a promotion run can move between. With `sectionId`, also the
 * active roll of that class, so the app can offer a per-student outcome.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["students.update", "students.promote"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const sectionId = new URL(req.url).searchParams.get("sectionId");
  const [sections, roster] = await Promise.all([
    promotableSections(session.schoolId),
    sectionId ? promotionRoster(session.schoolId, sectionId) : Promise.resolve([]),
  ]);

  return cors(NextResponse.json({ sections, roster, outcomes: OUTCOMES }));
}

const Body = z.object({
  sourceSectionId: z.string().min(1),
  targetSectionId: z.string().min(1),
  allowOverfill: z.boolean().default(false),
  /** studentId → outcome. Anyone left out is PROMOTED. */
  outcomes: z.record(z.string(), z.enum(OUTCOMES)).default({}),
});

/**
 * POST /api/mobile/v1/admin/promote
 *
 * Promotes a whole class into the next year's section. One transaction: every
 * student moves or none does. Same rules as the web console's promotion form —
 * both call `@/lib/promotion`.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, ["students.update", "students.promote"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the selected classes." },
      { status: 400 },
    ));
  }

  // Only students actually on the source roll may carry an outcome — a crafted
  // body must not be able to name a child in another class.
  const roll = new Set(
    (await promotionRoster(session.schoolId, parsed.data.sourceSectionId)).map(
      (r) => r.studentId,
    ),
  );
  const outcomes = new Map<string, Outcome>();
  for (const [studentId, outcome] of Object.entries(parsed.data.outcomes)) {
    if (roll.has(studentId)) outcomes.set(studentId, outcome);
  }

  const result = await promoteSection(
    { schoolId: session.schoolId, userId: session.userId },
    {
      sourceSectionId: parsed.data.sourceSectionId,
      targetSectionId: parsed.data.targetSectionId,
      allowOverfill: parsed.data.allowOverfill,
      outcomes,
    },
  );

  return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
}
