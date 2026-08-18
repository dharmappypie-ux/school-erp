import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { assertProductionEnv, env } from "@/lib/env";

assertProductionEnv();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  // Prisma 7 connects through a driver adapter rather than a datasource URL.
  const adapter = new PrismaPg({ connectionString: env.databaseUrl });
  return new PrismaClient({
    adapter,
    log: env.isProduction ? ["error"] : ["error", "warn"],
  });
}

/**
 * Shared Prisma client. Cached on `globalThis` so Next.js hot reloads in
 * development don't open a new connection pool on every recompile.
 */
export const prisma = globalForPrisma.prisma ?? createClient();

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

export { Prisma } from "@/generated/prisma/client";
