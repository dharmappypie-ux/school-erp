/**
 * Central environment access.
 *
 * Every value has a local-development fallback so the project runs immediately
 * after `git clone` without a `.env.local`. Anything security-sensitive refuses
 * its fallback in production — see `assertProductionEnv()`, called from
 * `src/lib/db.ts` on first import.
 */

// Homebrew's Postgres creates a superuser role named after the OS user, so the
// local fallback follows that convention rather than assuming `postgres`.
const DEV_DATABASE_URL = `postgresql://${
  process.env.USER || "postgres"
}@localhost:5432/school_erp?schema=public`;
const DEV_AUTH_SECRET = "insecure-development-secret-do-not-use-in-production";

function str(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * `prisma init` writes a dummy DATABASE_URL into `.env`. Left in place it
 * silently shadows a real connection string, so treat it as unset.
 */
function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return DEV_DATABASE_URL;
  const isPlaceholder =
    url.includes("johndoe:randompassword") || /\/mydb(\?|$)/.test(url);
  return isPlaceholder ? DEV_DATABASE_URL : url;
}

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  isProduction: process.env.NODE_ENV === "production",

  databaseUrl: resolveDatabaseUrl(),

  authSecret: str("AUTH_SECRET", DEV_AUTH_SECRET),
  sessionTtlHours: num("SESSION_TTL_HOURS", 12),

  appUrl: str("APP_URL", "http://localhost:3000"),
  appName: str("NEXT_PUBLIC_APP_NAME", "Vidyalaya ERP"),

  razorpay: {
    keyId: str("RAZORPAY_KEY_ID", ""),
    keySecret: str("RAZORPAY_KEY_SECRET", ""),
    webhookSecret: str("RAZORPAY_WEBHOOK_SECRET", ""),
  },
  stripe: {
    secretKey: str("STRIPE_SECRET_KEY", ""),
    webhookSecret: str("STRIPE_WEBHOOK_SECRET", ""),
  },

  smtp: {
    host: str("SMTP_HOST", ""),
    port: num("SMTP_PORT", 587),
    user: str("SMTP_USER", ""),
    password: str("SMTP_PASSWORD", ""),
    from: str("SMTP_FROM", "no-reply@school.local"),
  },
  msg91: {
    authKey: str("MSG91_AUTH_KEY", ""),
    senderId: str("MSG91_SENDER_ID", ""),
  },
  whatsapp: {
    phoneNumberId: str("WHATSAPP_PHONE_NUMBER_ID", ""),
    accessToken: str("WHATSAPP_ACCESS_TOKEN", ""),
  },
  vapid: {
    publicKey: str("VAPID_PUBLIC_KEY", ""),
    privateKey: str("VAPID_PRIVATE_KEY", ""),
  },

  ai: {
    apiKey: str("ANTHROPIC_API_KEY", ""),
    model: str("AI_MODEL", "claude-sonnet-5"),
  },
} as const;

/**
 * Refuse to boot a production deployment that is still running on dev defaults.
 */
export function assertProductionEnv(): void {
  if (!env.isProduction) return;

  // `next build` runs with NODE_ENV=production but has no reason to hold
  // production secrets — CI machines legitimately build without them. The
  // guard must gate serving requests, not compiling the app.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const problems: string[] = [];
  if (env.authSecret === DEV_AUTH_SECRET) {
    problems.push("AUTH_SECRET is still the development default");
  }
  if (env.authSecret.length < 32) {
    problems.push("AUTH_SECRET must be at least 32 characters");
  }
  if (env.databaseUrl === DEV_DATABASE_URL) {
    problems.push("DATABASE_URL is still the development default");
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with insecure configuration:\n  - ${problems.join(
        "\n  - ",
      )}`,
    );
  }
}
