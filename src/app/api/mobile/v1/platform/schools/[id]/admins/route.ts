import { NextResponse } from "next/server";
import { z } from "zod";

import { cors, requireMobilePlatformAdmin } from "@/lib/mobile-auth";
import { addSchoolAdminCore, ADMIN_ROLE_KEYS } from "@/lib/platform";

export { OPTIONS } from "@/lib/mobile-auth";

const Body = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  roleKey: z.enum(ADMIN_ROLE_KEYS).default("ADMIN"),
});

/**
 * POST /api/mobile/v1/platform/schools/[id]/admins
 *
 * Adds a super admin or admin to a school and returns their one-time password.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobilePlatformAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    ));
  }

  const result = await addSchoolAdminCore(
    { schoolId: session.schoolId, userId: session.userId },
    { schoolId: id, ...parsed.data },
  );
  return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
}
