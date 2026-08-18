import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    // Still burn a comparison so a missing password hash isn't detectable by
    // response timing.
    await bcrypt.compare(plain, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduO");
    return false;
  }
  return bcrypt.compare(plain, hash);
}

export interface PasswordStrength {
  ok: boolean;
  problems: string[];
}

export function checkPasswordStrength(plain: string): PasswordStrength {
  const problems: string[] = [];
  if (plain.length < 8) problems.push("Must be at least 8 characters long");
  if (!/[a-z]/.test(plain)) problems.push("Must contain a lowercase letter");
  if (!/[A-Z]/.test(plain)) problems.push("Must contain an uppercase letter");
  if (!/[0-9]/.test(plain)) problems.push("Must contain a number");
  return { ok: problems.length === 0, problems };
}
