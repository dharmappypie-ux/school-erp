import { NextResponse } from "next/server";

import { ALL_PLANS, featuresFor, PLAN_LABEL } from "@/lib/entitlements";
import { SubscriptionPlan } from "@/generated/prisma/enums";
import { cors, requireMobilePlatformAdmin } from "@/lib/mobile-auth";
import {
  schoolOverview,
  setSchoolActiveCore,
  setSchoolPlanCore,
} from "@/lib/platform";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/platform/schools/[id]
 *
 * One tenant and its administrators — the platform detail view. The internal
 * data of a school (its students, fees, marks) is deliberately NOT here: a
 * platform owner provisions and bills a school, they do not run it.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobilePlatformAdmin(req);
  if (guard instanceof NextResponse) return guard;

  const { id } = await ctx.params;
  const overview = await schoolOverview(id);
  if (!overview) {
    return cors(NextResponse.json({ error: "That school does not exist." }, { status: 404 }));
  }
  const { school, admins, years, currentYear } = overview;

  return cors(NextResponse.json({
    school: {
      id: school.id,
      name: school.name,
      slug: school.slug,
      code: school.code,
      board: school.board,
      location: [school.city, school.state].filter(Boolean).join(", "),
      plan: school.plan,
      planLabel: PLAN_LABEL[school.plan],
      features: featuresFor(school.plan),
      currency: school.currency,
      isActive: school.isActive,
      createdAt: school.createdAt.toISOString(),
      students: school._count.students,
      staff: school._count.staff,
      users: school._count.users,
      years,
      currentYear,
    },
    plans: ALL_PLANS.map((plan) => ({ key: plan, label: PLAN_LABEL[plan] })),
    admins: admins.map((a) => ({
      id: a.id,
      name: `${a.firstName} ${a.lastName ?? ""}`.trim(),
      email: a.email,
      status: a.status,
      roleKey: a.roles.find((r) => r.key === "SUPER_ADMIN")?.key ?? a.roles[0]?.key ?? "ADMIN",
      roleName: a.roles[0]?.name ?? "Administrator",
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      mustChangePassword: a.mustChangePassword,
    })),
  }));
}

/**
 * POST /api/mobile/v1/platform/schools/[id]
 *
 * Tenant-level changes: `{ "plan": "PREMIUM" }` moves the school to another
 * subscription tier, `{ "isActive": false }` switches the whole tenant off
 * (nobody in it can then sign in, on either surface).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobilePlatformAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { plan?: string; isActive?: boolean }
    | null;
  if (!body) {
    return cors(NextResponse.json({ error: "Expected a JSON body." }, { status: 400 }));
  }

  const actor = { schoolId: session.schoolId, userId: session.userId };

  if (typeof body.isActive === "boolean") {
    const result = await setSchoolActiveCore(actor, id, body.isActive);
    return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
  }

  if (body.plan) {
    if (!(ALL_PLANS as readonly string[]).includes(body.plan)) {
      return cors(NextResponse.json({ error: "Unknown plan." }, { status: 400 }));
    }
    const result = await setSchoolPlanCore(actor, id, body.plan as SubscriptionPlan);
    return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
  }

  return cors(NextResponse.json(
    { error: "Send either a plan or isActive." },
    { status: 400 },
  ));
}
