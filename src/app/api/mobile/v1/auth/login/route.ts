import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { cors } from "@/lib/mobile-auth";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

export { OPTIONS } from "@/lib/mobile-auth";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  school: z.string().trim().optional(),
});

/**
 * POST /api/mobile/v1/auth/login
 *
 * Verifies credentials exactly as the web login does and returns the session
 * token for the native client to store in the device keychain. (The same call
 * also sets the session cookie, which native clients simply ignore.)
 */
export async function POST(req: Request) {
  const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 }));
  }
  const { email, password, school } = parsed.data;

  const candidates = await prisma.user.findMany({
    where: {
      email,
      deletedAt: null,
      school: school ? { slug: school, isActive: true } : { isActive: true },
    },
    include: { roles: { select: { key: true } }, school: { select: { name: true, slug: true } } },
    take: 5,
  });

  const fail = cors(NextResponse.json(
    { error: "Those credentials don't match an active account." },
    { status: 401 },
  ));

  if (candidates.length === 0) {
    await verifyPassword(password, null); // constant-time
    return fail;
  }

  for (const user of candidates) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return cors(NextResponse.json(
        { error: "Account temporarily locked after too many failed attempts." },
        { status: 423 },
      ));
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) continue;
    if (user.status !== "ACTIVE") {
      return cors(NextResponse.json({ error: "This account is not active." }, { status: 403 }));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    const { token, expiresAt } = await createSession(user.id, {
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return cors(NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
      // The token is real, but every other endpoint refuses it until the
      // temporary password is replaced. Told here so the app can go straight to
      // its change-password screen instead of discovering it as a 403 on the
      // first thing the user taps.
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName ?? ""}`.trim(),
        email: user.email,
        school: user.school.name,
        roles: user.roles.map((r) => r.key),
      },
    }));
  }

  return fail;
}
