import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "school_session";

/**
 * The cookie carries the raw token; only its SHA-256 digest is stored, so a
 * leaked database dump cannot be replayed as a live session.
 */
function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3600 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: digest(token),
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function destroySession(): Promise<void> {
  const token = await readSessionToken();
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: digest(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function hashSessionToken(token: string): string {
  return digest(token);
}
