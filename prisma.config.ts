import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// `.env.local` is the project's convention (Next.js reads it too); `.env` is
// still honoured if present. Neither file is required — src/lib/env.ts supplies
// a local-development fallback.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

/**
 * `prisma init` writes a dummy DATABASE_URL into `.env`. Left in place it
 * silently shadows a real connection string, so treat it as unset.
 */
function isPrismaPlaceholder(url: string | undefined): boolean {
  if (!url) return true;
  return url.includes("johndoe:randompassword") || /\/mydb(\?|$)/.test(url);
}

const configured = process.env.DATABASE_URL;
const databaseUrl = isPrismaPlaceholder(configured)
  ? `postgresql://${process.env.USER || "postgres"}@localhost:5432/school_erp?schema=public`
  : (configured as string);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
