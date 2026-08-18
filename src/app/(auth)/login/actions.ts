"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { resolveHomeRoute } from "@/lib/permissions";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  school: z.string().trim().optional(),
});

export interface LoginState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    school: formData.get("school"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const { email, password, school } = parsed.data;

  // One email may exist in more than one tenant, so narrow by school when the
  // caller supplies one.
  const candidates = await prisma.user.findMany({
    where: {
      email,
      deletedAt: null,
      school: school ? { slug: school, isActive: true } : { isActive: true },
    },
    include: { roles: { select: { key: true } }, school: { select: { slug: true } } },
    take: 5,
  });

  // A single generic message for every failure mode: a distinct "no such user"
  // reply would let anyone enumerate valid accounts.
  const genericFailure: LoginState = {
    error: "Those credentials don't match an active account.",
  };

  if (candidates.length === 0) {
    // Burn comparable time so a missing account isn't detectable by timing.
    await verifyPassword(password, null);
    return genericFailure;
  }

  for (const user of candidates) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return {
        error: `Account temporarily locked after too many failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString()}.`,
      };
    }

    const matches = await verifyPassword(password, user.passwordHash);
    if (!matches) continue;

    if (user.status !== "ACTIVE") {
      return { error: "This account is not active. Contact your administrator." };
    }

    const requestHeaders = await headers();
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });

    await createSession(user.id, {
      ipAddress:
        requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: requestHeaders.get("user-agent") ?? undefined,
    });

    redirect(
      user.mustChangePassword
        ? "/change-password"
        : resolveHomeRoute(user.roles.map((role) => role.key)),
    );
  }

  // No candidate matched — count the failure against every account sharing
  // this address so brute force is throttled per identity, not per attempt.
  for (const user of candidates) {
    const failedLoginCount = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil:
          failedLoginCount >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60000)
            : null,
      },
    });
  }

  return genericFailure;
}
