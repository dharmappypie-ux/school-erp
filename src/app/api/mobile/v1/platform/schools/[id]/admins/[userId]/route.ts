import { NextResponse } from "next/server";

import { cors, requireMobilePlatformAdmin } from "@/lib/mobile-auth";
import {
  ADMIN_ROLE_KEYS,
  ADMIN_STATUSES,
  resetSchoolAdminPasswordCore,
  setSchoolAdminRoleCore,
  setSchoolAdminStatusCore,
  type AdminRoleKey,
  type AdminStatus,
} from "@/lib/platform";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * POST /api/mobile/v1/platform/schools/[id]/admins/[userId]
 *
 * One of three changes to a school administrator, chosen by `action`:
 *   { "action": "role",     "value": "SUPER_ADMIN" | "ADMIN" }
 *   { "action": "status",   "value": "ACTIVE" | "INACTIVE" | "SUSPENDED" }
 *   { "action": "password" }  → issues a fresh one-time password
 *
 * The guards that keep a school manageable (never demote, deactivate or
 * suspend its last active super admin) live in `@/lib/platform`, so the app and
 * the web console refuse exactly the same things.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> },
) {
  const guard = await requireMobilePlatformAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const { id, userId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { action?: string; value?: string }
    | null;
  const actor = { schoolId: session.schoolId, userId: session.userId };

  switch (body?.action) {
    case "role": {
      if (!(ADMIN_ROLE_KEYS as readonly string[]).includes(body.value ?? "")) {
        return cors(NextResponse.json({ error: "Unknown role." }, { status: 400 }));
      }
      const result = await setSchoolAdminRoleCore(
        actor, id, userId, body.value as AdminRoleKey,
      );
      return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
    }
    case "status": {
      if (!(ADMIN_STATUSES as readonly string[]).includes(body.value ?? "")) {
        return cors(NextResponse.json({ error: "Unknown status." }, { status: 400 }));
      }
      const result = await setSchoolAdminStatusCore(
        actor, id, userId, body.value as AdminStatus,
      );
      return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
    }
    case "password": {
      const result = await resetSchoolAdminPasswordCore(actor, id, userId);
      return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
    }
    default:
      return cors(NextResponse.json(
        { error: "Send an action of role, status or password." },
        { status: 400 },
      ));
  }
}
