import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { cors, resolveMobileSession } from "@/lib/mobile-auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { revokeAllSessions } from "@/lib/session";

export { OPTIONS } from "@/lib/mobile-auth";

/** Same floor as the web form, so the two cannot disagree about what is allowed. */
const MIN_LENGTH = 10;

const Schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(MIN_LENGTH, `Use at least ${MIN_LENGTH} characters`).max(200),
});

/**
 * POST /api/mobile/v1/auth/change-password
 *
 * The only authenticated route that does NOT refuse a session carrying
 * `mustChangePassword` — it resolves the session directly rather than going
 * through requireMobile, because a user locked out of every other endpoint
 * needs exactly one way forward.
 */
export async function POST(req: Request) {
  const session = await resolveMobileSession(req);
  if (!session) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(
      NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      ),
    );
  }

  const { currentPassword, newPassword } = parsed.data;
  if (newPassword === currentPassword) {
    return cors(
      NextResponse.json(
        { error: "Choose a password different from the current one" },
        { status: 400 },
      ),
    );
  }

  // The id comes from the session, never the request, so a user can only ever
  // change their own password and there is nothing for a tenant filter to add.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    return cors(NextResponse.json({ error: "That account no longer exists." }, { status: 404 }));
  }

  // Required even though the session proves identity: a phone left unlocked on
  // a staffroom table should not be enough to lock its owner out.
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return cors(
      NextResponse.json({ error: "That is not your current password" }, { status: 400 }),
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "user.password.change",
    entityType: "User",
    entityId: user.id,
    after: { via: "mobile" },
  });

  // Including this one. If the temporary password had been seen by somebody
  // else, changing it has to end whatever they were already holding — so the
  // app signs in again, which also proves the new password works.
  await revokeAllSessions(user.id);

  return cors(
    NextResponse.json({
      ok: true,
      message: "Password changed. Sign in again with your new password.",
    }),
  );
}
