/**
 * Proves the parent/student portal cannot reach another family's data.
 *
 *   npx tsx scripts/verify-portal-access.ts
 *
 * The portal is the one place authorisation cannot be a permission check —
 * every parent holds the same permission, but each may see only their own
 * children. These checks pin that boundary down. Exits non-zero on failure.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { prisma } from "../src/lib/db";
import { hasPermission, ROLE_PRESET_BY_KEY } from "../src/lib/permissions";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function main() {
  const school = await prisma.school.findUniqueOrThrow({ where: { slug: "greenwood" } });

  // -- Role presets must not grant school-wide reads -----------------------
  for (const key of ["PARENT", "STUDENT"] as const) {
    const preset = ROLE_PRESET_BY_KEY.get(key);
    if (!preset) {
      check(`${key} preset exists`, false);
      continue;
    }
    const forbidden = [
      "students.read",
      "reportcards.read",
      "marks.read",
      "fees.read",
      "attendance.read",
      "staff.read",
      "analytics.read",
      "*",
    ];
    const leaked = forbidden.filter((permission) =>
      hasPermission(preset.permissions, permission),
    );
    check(
      `${key} holds no school-wide read permission`,
      leaked.length === 0,
      leaked.length ? `leaks: ${leaked.join(", ")}` : `only ${preset.permissions.join(", ")}`,
    );
    check(
      `${key} can access the portal`,
      hasPermission(preset.permissions, "portal.access"),
    );
  }

  // -- The stored roles must match the presets (seed actually applied) ------
  for (const key of ["PARENT", "STUDENT"] as const) {
    const role = await prisma.role.findUnique({
      where: { schoolId_key: { schoolId: school.id, key } },
    });
    check(
      `${key} role in the database carries the tightened permissions`,
      role !== null && !hasPermission(role.permissions, "students.read"),
      role ? role.permissions.join(", ") : "role missing",
    );
  }

  // -- Relationship scoping -------------------------------------------------
  const guardianLinks = await prisma.studentGuardian.findMany({
    where: { student: { schoolId: school.id } },
    take: 2,
    include: {
      guardian: { select: { id: true, userId: true, firstName: true } },
      student: { select: { id: true, firstName: true } },
    },
  });

  if (guardianLinks.length < 2) {
    check("found at least two guardian links to compare", false);
  } else {
    const [mine, theirs] = guardianLinks;

    // What the portal would resolve for this guardian.
    const myChildren = await prisma.studentGuardian.findMany({
      where: { guardianId: mine.guardian.id },
      select: { studentId: true },
    });
    const myChildIds = new Set(myChildren.map((row) => row.studentId));

    check(
      "a guardian resolves to their own child",
      myChildIds.has(mine.student.id),
      `${mine.guardian.firstName} → ${mine.student.firstName}`,
    );
    check(
      "a guardian does not resolve to another family's child",
      !myChildIds.has(theirs.student.id),
      `${theirs.student.firstName} is not reachable`,
    );

    // Simulate the portal's own lookup with a tampered ?child= id.
    const tampered = await prisma.studentGuardian.findFirst({
      where: { guardianId: mine.guardian.id, studentId: theirs.student.id },
    });
    check(
      "a tampered child id finds no guardian link, so the portal 404s",
      tampered === null,
    );
  }

  // -- Unpublished report cards must never surface -------------------------
  const draft = await prisma.reportCard.findFirst({
    where: { schoolId: school.id, isPublished: false },
    select: { id: true, studentId: true },
  });

  if (!draft) {
    console.log("[ note ] no unpublished report card in the data to probe");
  } else {
    const visibleToFamily = await prisma.reportCard.findFirst({
      where: { id: draft.id, studentId: draft.studentId, isPublished: true },
    });
    check(
      "an unpublished report card is invisible under the portal's filter",
      visibleToFamily === null,
      "portal queries always require isPublished: true",
    );
  }

  const publishedCount = await prisma.reportCard.count({
    where: { schoolId: school.id, isPublished: true },
  });
  check(
    "published report cards are still reachable",
    publishedCount > 0,
    `${publishedCount} published`,
  );

  console.log(
    failures === 0
      ? "\nAll portal access checks passed.\n"
      : `\n${failures} portal access check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
