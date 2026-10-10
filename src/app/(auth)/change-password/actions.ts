"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/db";
import { resolveHomeRoute } from "@/lib/permissions";
import { revokeAllSessions } from "@/lib/session";

export interface ChangePasswordState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Long enough to be worth the trouble, short enough that people comply. */
const MIN_LENGTH = 10;

const Schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z
    .string()
    .min(MIN_LENGTH, `Use at least ${MIN_LENGTH} characters`)
    .max(200),
  confirmPassword: z.string().min(1, "Type the new password again"),
});

/**
 * Changes the signed-in user's own password.
 *
 * The current password is required even though the session already proves who
 * they are: these accounts are handed out with a temporary password, and an
 * unlocked machine in a staffroom should not be enough to lock the real owner
 * out of their own account.
 */
export async function changePassword(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await requireAuth();

  const parsed = Schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const { currentPassword, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return { fieldErrors: { confirmPassword: "The two passwords do not match" } };
  }
  if (newPassword === currentPassword) {
    return {
      fieldErrors: {
        newPassword: "Choose a password different from the current one",
      },
    };
  }

  // Not scopedDb: a user may only ever change their own password, and the id
  // comes from the session rather than the request, so there is nothing for a
  // tenant filter to protect here.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) return { error: "That account no longer exists." };

  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) {
    return { fieldErrors: { currentPassword: "That is not your current password" } };
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
  });

  // Every other session is cut. If the temporary password had been seen by
  // somebody else, changing it has to end whatever they were already holding.
  await revokeAllSessions(user.id);

  // revokeAllSessions took this one too, so they sign in again with the new
  // password — which also proves it works before they rely on it.
  redirect("/login?changed=1");
}

/** Where to send someone who did not actually need to be here. */
export async function homeRouteFor(roleKeys: readonly string[]): Promise<string> {
  return resolveHomeRoute(roleKeys);
}
