import bcrypt from "bcryptjs";

const ROUNDS = 12;

// IMPORTANT: use bcryptjs's SYNCHRONOUS API, never the async/Promise form.
// bcryptjs's async implementation schedules its work with setImmediate-style
// yields that never resume on the Cloudflare Workers runtime, so the request
// hangs and workerd cancels it with a 500 ("your Worker's code had hung").
// The sync variants are pure CPU, finite, and run fine on both Node and
// Workers; the hash format is identical, so existing hashes still verify.

// A real hash to compare against when no account matches, so a missing user
// costs the same CPU as a real one (defeats user-enumeration by timing).
// Computed lazily to keep it off the Worker's cold-start path.
let dummyHash: string | null = null;
function getDummyHash(): string {
  return (dummyHash ??= bcrypt.hashSync("unused-placeholder-for-timing", ROUNDS));
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hashSync(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    // Still burn a comparison so a missing password hash isn't detectable by
    // response timing.
    bcrypt.compareSync(plain, getDummyHash());
    return false;
  }
  return bcrypt.compareSync(plain, hash);
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
