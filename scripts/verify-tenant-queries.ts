/**
 * Guards the gap in automatic tenant scoping.
 *
 *   npx tsx scripts/verify-tenant-queries.ts
 *
 * `scopedDb` injects `schoolId` automatically, but only for models that have
 * that column. Join and detail tables — StudentGuardian, BookCopy,
 * HomeworkSubmission, ClassSubject … — do not, so a query against one is
 * scoped only if the author filtered through a parent relation.
 *
 * That gap produced a real cross-tenant leak: the broadcast composer counted
 * every school's guardians because its filter reached the student relation
 * without naming `schoolId`, so one school's admin would have messaged
 * another's parents.
 *
 * This check finds every such query and requires an explicit
 * `tenant-safe:` comment stating how it is scoped. The point is not the
 * comment — it is that the author had to think about it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SCAN_DIR = join(process.cwd(), "src");
const SCHEMA = join(process.cwd(), "prisma", "schema.prisma");

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "generated" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Models carrying a `schoolId`, read from the schema itself so this cannot
 * drift from reality the way a hand-maintained list would.
 */
function modelsWithSchoolId(): Set<string> {
  const schema = readFileSync(SCHEMA, "utf8");
  const scoped = new Set<string>();

  for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match;
    if (/^\s*schoolId\s+String/m.test(body)) scoped.add(name);
  }
  // The tenant root itself is inherently scoped.
  scoped.add("School");
  return scoped;
}

const QUERY = /\bdb\.([a-zA-Z]+)\.(findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|update|updateMany|delete|deleteMany|create|createMany|upsert)\b/g;

function main() {
  const scopedModels = modelsWithSchoolId();
  const scopedLower = new Set(
    [...scopedModels].map((name) => name[0].toLowerCase() + name.slice(1)),
  );

  const files = walk(SCAN_DIR).filter((file) => /\.tsx?$/.test(file));
  const unguarded: { file: string; line: number; model: string; op: string }[] = [];
  let acknowledged = 0;

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");

    QUERY.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = QUERY.exec(text)) !== null) {
      const model = match[1];
      if (scopedLower.has(model)) continue;

      const lineIndex = text.slice(0, match.index).split("\n").length - 1;

      // Look back a few lines for the acknowledgement, so it can sit above a
      // multi-line query or its doc comment.
      const window = lines.slice(Math.max(0, lineIndex - 6), lineIndex + 1).join("\n");
      if (/tenant-safe:/i.test(window)) {
        acknowledged += 1;
        continue;
      }

      unguarded.push({
        file: relative(process.cwd(), file),
        line: lineIndex + 1,
        model,
        op: match[2],
      });
    }
  }

  console.log(
    `\n${scopedModels.size} models carry schoolId and are scoped automatically.` +
      `\n${acknowledged} queries against unscoped models carry a tenant-safe note.\n`,
  );

  check(
    "the schema was parsed",
    scopedModels.size > 10,
    `${scopedModels.size} tenant models found`,
  );

  if (unguarded.length === 0) {
    check("every query against an unscoped model explains how it is scoped", true);
  } else {
    check(
      "every query against an unscoped model explains how it is scoped",
      false,
      `${unguarded.length} unexplained`,
    );
    console.log("");
    for (const entry of unguarded) {
      console.log(`   ${entry.file}:${entry.line}  db.${entry.model}.${entry.op}`);
    }
    console.log(
      "\n   These models have no schoolId, so scopedDb cannot filter them." +
        "\n   Reach the tenant through a parent relation (e.g." +
        "\n   `where: { student: { schoolId } }`) and add a comment above:" +
        "\n     // tenant-safe: <how this query is bound to one school>",
    );
  }

  console.log(
    failures === 0
      ? "\nAll tenant query checks passed.\n"
      : `\n${failures} tenant query check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
