import { NextResponse } from "next/server";

import { ALL_PLANS, PLAN_LABEL } from "@/lib/entitlements";
import { cors, requireMobilePlatformAdmin } from "@/lib/mobile-auth";
import { listSchools, provisionSchool, SchoolSchema } from "@/lib/platform";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/platform/schools
 *
 * Every tenant on the platform, with the roll-up the console's stat tiles show.
 * Cross-tenant by definition, so it is gated on the platform-owner role key.
 */
export async function GET(req: Request) {
  const guard = await requireMobilePlatformAdmin(req);
  if (guard instanceof NextResponse) return guard;

  const schools = await listSchools();

  return cors(NextResponse.json({
    totals: {
      schools: schools.length,
      active: schools.filter((s) => s.isActive).length,
      students: schools.reduce((sum, s) => sum + s._count.students, 0),
      staff: schools.reduce((sum, s) => sum + s._count.staff, 0),
    },
    // The plan vocabulary, so the app's picker never hard-codes a tier list
    // that could fall behind the server's.
    plans: ALL_PLANS.map((plan) => ({ key: plan, label: PLAN_LABEL[plan] })),
    schools: schools.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      code: s.code,
      board: s.board,
      location: [s.city, s.state].filter(Boolean).join(", "),
      plan: s.plan,
      planLabel: PLAN_LABEL[s.plan],
      isActive: s.isActive,
      currency: s.currency,
      createdAt: s.createdAt.toISOString(),
      students: s._count.students,
      staff: s._count.staff,
      users: s._count.users,
    })),
  }));
}

/**
 * POST /api/mobile/v1/platform/schools
 *
 * Provisions a whole new tenant — school, system roles, current academic year
 * and a first super-admin with a one-time password. Same code as the web
 * console's "Add school", so the two cannot drift.
 */
export async function POST(req: Request) {
  const guard = await requireMobilePlatformAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = SchoolSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    ));
  }

  const result = await provisionSchool(
    { schoolId: session.schoolId, userId: session.userId },
    parsed.data,
  );
  return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
}
