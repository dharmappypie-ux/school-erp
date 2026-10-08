import { randomInt } from "node:crypto";

import type { ScopedDb } from "@/lib/tenant";

/** A readable one-time password, same shape as the web user-admin screens. */
export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `Vidya-${suffix}`;
}

/**
 * A school must never be left with zero super admins. Returns a blocking message
 * when `userId` is the last active SUPER_ADMIN and the pending change would
 * remove that access; null when the change is safe.
 */
export async function wouldOrphanSuperAdmin(db: ScopedDb, userId: string): Promise<string | null> {
  const isAdmin = await db.user.findFirst({
    where: { id: userId, roles: { some: { key: "SUPER_ADMIN" } } },
    select: { id: true },
  });
  if (!isAdmin) return null;
  const otherAdmins = await db.user.count({
    where: { status: "ACTIVE", roles: { some: { key: "SUPER_ADMIN" } }, NOT: { id: userId } },
  });
  return otherAdmins === 0
    ? "This is the school's only super admin. Promote another user to super admin first."
    : null;
}

/** A platform owner's account must not be editable from a school's admin screens. */
export async function isPlatformOwner(db: ScopedDb, userId: string): Promise<boolean> {
  const hit = await db.user.findFirst({
    where: { id: userId, roles: { some: { key: "PLATFORM_ADMIN" } } },
    select: { id: true },
  });
  return Boolean(hit);
}
