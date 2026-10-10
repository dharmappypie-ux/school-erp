/**
 * Brings existing roles up to date with the role presets in code.
 *
 * Roles are written from `ROLE_PRESETS` in two places only: when a school is
 * seeded, and when the platform console creates one. A permission added to a
 * preset afterwards therefore reaches nobody — the role rows in the database
 * still carry the list they were created with, and the new screen is invisible
 * to every existing school. This script closes that gap.
 *
 * It is deliberately ADDITIVE. A school that has tailored a role — removed
 * `fees.refund` from its accountant, say — keeps that decision; the script only
 * grants what the preset has and the role lacks. Removing a permission is a
 * judgement call about a live school's access and belongs in the UI, not in a
 * bulk script run from a terminal.
 *
 * Usage:
 *   npm run sync:roles                                  # dry run, writes nothing
 *   DATABASE_URL="postgresql://…" npm run sync:roles    # dry run elsewhere
 *   DATABASE_URL="postgresql://…" npm run sync:roles -- --apply
 *
 * --apply refuses to run unless DATABASE_URL is set, because env.databaseUrl
 * falls back to the local dev database and a silent no-op against localhost
 * looks identical to a successful production sync.
 */

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { env } from "../src/lib/env";
import { ROLE_PRESET_BY_KEY } from "../src/lib/permissions";

const apply = process.argv.includes("--apply");

/**
 * Where this run will actually write, with the credentials stripped.
 *
 * `env.databaseUrl` silently falls back to the local dev database when
 * DATABASE_URL is unset, so `npm run sync:roles -- --apply` run from a laptop
 * reports a tidy "0 updated · all current" against localhost and touches
 * production not at all. That reads exactly like success. Naming the host on
 * every run makes the no-op visible.
 */
function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, "") || "(default)";
    return `${parsed.hostname}:${parsed.port || "5432"}/${db}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

const explicitUrl = Boolean(process.env.DATABASE_URL);
const target = describeTarget(env.databaseUrl);

console.log(
  `Target: ${target}${explicitUrl ? "" : "  (DATABASE_URL unset — local dev fallback)"}\n`,
);

// Writing is refused unless the caller said which database they meant. A dry
// run against the fallback is harmless and still useful, so only --apply is
// gated.
if (apply && !explicitUrl) {
  console.error(
    "Refusing to --apply without DATABASE_URL set.\n\n" +
      `This would write to ${target}, the local dev fallback, not the database\n` +
      "you probably meant. Say which one explicitly:\n\n" +
      '  DATABASE_URL="postgresql://…" npm run sync:roles -- --apply\n\n' +
      "or put it in .env.local, which prisma.config.ts already loads.",
  );
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: env.databaseUrl, max: 3 });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const roles = await prisma.role.findMany({
    select: {
      id: true,
      key: true,
      permissions: true,
      school: { select: { name: true, slug: true } },
    },
    orderBy: [{ school: { name: "asc" } }, { key: "asc" }],
  });

  let changed = 0;
  let unchanged = 0;
  let unknown = 0;

  for (const role of roles) {
    const preset = ROLE_PRESET_BY_KEY.get(role.key);
    if (!preset) {
      // A role the school invented. Nothing in code describes what it should
      // hold, so it is left completely alone.
      unknown += 1;
      continue;
    }

    const held = new Set(role.permissions);
    const missing = preset.permissions.filter(
      (permission) => !held.has(permission),
    );

    if (missing.length === 0) {
      unchanged += 1;
      continue;
    }

    changed += 1;
    const where = `${role.school.slug}/${role.key}`;
    console.log(`${apply ? "+" : "would add"} ${where}: ${missing.join(", ")}`);

    if (apply) {
      await prisma.role.update({
        where: { id: role.id },
        data: { permissions: [...role.permissions, ...missing] },
      });
    }
  }

  console.log(
    `\n${roles.length} roles · ${changed} ${apply ? "updated" : "to update"} · ${unchanged} already current · ${unknown} custom (left alone)`,
  );
  if (!apply && changed > 0) {
    console.log("Nothing was written. Re-run with --apply to make the change.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
