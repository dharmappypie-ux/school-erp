import { cache } from "react";

import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { PrismaClient } from "@/generated/prisma/client";
import { assertProductionEnv, env } from "@/lib/env";

assertProductionEnv();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Resolves the Postgres connection string at client-creation time.
 *
 * On Cloudflare Workers a **Hyperdrive** binding (`env.HYPERDRIVE`) is preferred
 * — it pools connections at the edge, which serverless Postgres needs. Its
 * `connectionString` is only available inside a request, which is why the client
 * is built lazily (below) rather than at module load. Everywhere else — local
 * dev, `next build`, the verify scripts — `getCloudflareContext()` throws and we
 * fall back to `DATABASE_URL` (the direct connection) or the dev default.
 */
function resolveConnectionString(): string {
  try {
    const { env: cfEnv } = getCloudflareContext();
    const hyperdrive = (cfEnv as { HYPERDRIVE?: { connectionString?: string } })
      .HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    // Not inside a Workers request — fall through to the direct URL.
  }
  // `env.databaseUrl` reads DATABASE_URL with placeholder handling and the dev
  // fallback, and on Workers reflects the DATABASE_URL secret OpenNext injects.
  return env.databaseUrl;
}

function createClient(): PrismaClient {
  // Prisma 7 connects through a driver adapter rather than a datasource URL.
  // A small, time-bounded pool keeps each edge isolate's connection footprint
  // low and fails fast rather than hanging, which serverless Postgres needs.
  const adapter = new PrismaPg({
    connectionString: resolveConnectionString(),
    max: 3,
    connectionTimeoutMillis: 10000,
    // Hand idle connections back rather than holding them for the process's
    // life. In dev this matters most: Turbopack rebuilds the module graph on
    // each hot reload, the globalThis singleton below does not always survive
    // it, and without a timeout every stale pool keeps three connections open
    // until Postgres refuses new ones with "too many clients already".
    idleTimeoutMillis: 10000,
  });
  return new PrismaClient({
    adapter,
    log: env.isProduction ? ["error"] : ["error", "warn"],
  });
}

/** True inside a Cloudflare Workers request (bindings/ctx are present). */
function onWorkers(): boolean {
  try {
    getCloudflareContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * One Prisma client PER REQUEST on Workers.
 *
 * A `pg` connection is an I/O object scoped to the request that opened it; the
 * Workers runtime forbids using it from a different request, and doing so makes
 * the next request hang ("your Worker's code had hung"). `React.cache()`
 * memoises per request, so every query in one request shares a client while a
 * new request always gets a fresh connection.
 */
const getRequestClient = cache((): PrismaClient => createClient());

function getClient(): PrismaClient {
  // Workers: never reuse a connection across requests — see above.
  if (onWorkers()) return getRequestClient();
  // Node (dev, `next build`, verify scripts): a global singleton is correct and
  // avoids opening a new pool on every query and every hot reload.
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Shared Prisma client.
 *
 * A lazy proxy rather than an eager instance: the underlying client is built on
 * first query, which on Workers is inside a request (where bindings and secrets
 * are available) instead of at module load, where they are not.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { Prisma } from "@/generated/prisma/client";
