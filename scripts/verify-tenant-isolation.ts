/**
 * Proves the tenant-scoping extension isolates data between schools.
 *
 *   npx tsx scripts/verify-tenant-isolation.ts
 *
 * Exits non-zero on the first leak, so it can gate CI.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { prisma } from "../src/lib/db";
import { scopedDb } from "../src/lib/tenant";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  const mark = passed ? "  ok  " : " FAIL ";
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function main() {
  const greenwood = await prisma.school.findUniqueOrThrow({ where: { slug: "greenwood" } });
  const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });

  const gdb = scopedDb(greenwood.id);
  const sdb = scopedDb(sunrise.id);

  // -- findMany ------------------------------------------------------------
  const gStudents = await gdb.student.findMany({ select: { id: true, schoolId: true } });
  const sStudents = await sdb.student.findMany({ select: { id: true, schoolId: true } });
  check(
    "findMany returns only the scoped school's students",
    gStudents.every((s) => s.schoolId === greenwood.id) &&
      sStudents.every((s) => s.schoolId === sunrise.id),
    `greenwood=${gStudents.length}, sunrise=${sStudents.length}`,
  );
  check(
    "the two tenants return disjoint student sets",
    !gStudents.some((g) => sStudents.some((s) => s.id === g.id)),
  );

  // -- count ---------------------------------------------------------------
  const unscopedTotal = await prisma.student.count();
  const gCount = await gdb.student.count();
  const sCount = await sdb.student.count();
  check(
    "count is scoped and the parts sum to the whole",
    gCount + sCount === unscopedTotal && gCount !== unscopedTotal,
    `${gCount} + ${sCount} = ${unscopedTotal}`,
  );

  // -- findUnique rewritten to findFirst ------------------------------------
  const victim = sStudents[0];
  const leaked = await gdb.student.findUnique({ where: { id: victim.id } });
  check(
    "findUnique on another tenant's id returns null",
    leaked === null,
    `probed sunrise student ${victim.id.slice(0, 8)}… as greenwood`,
  );

  const own = await gdb.student.findUnique({ where: { id: gStudents[0].id } });
  check(
    "findUnique still resolves the scoped tenant's own record",
    own?.id === gStudents[0].id,
  );

  // -- compound unique selectors -------------------------------------------
  // `findUnique` is rewritten to `findFirst`, which does not understand
  // Prisma's composite key names — these must be flattened, or every lookup by
  // a compound unique throws.
  const ownRole = await gdb.role.findUnique({
    where: { schoolId_key: { schoolId: greenwood.id, key: "STUDENT" } },
  });
  check(
    "findUnique on a compound unique resolves within the scope",
    ownRole !== null && ownRole.schoolId === greenwood.id,
    "role.schoolId_key",
  );

  const foreignRole = await gdb.role.findUnique({
    where: { schoolId_key: { schoolId: sunrise.id, key: "STUDENT" } },
  });
  check(
    "findUnique on another tenant's compound unique returns null",
    foreignRole === null,
    "the injected scope wins over the supplied schoolId",
  );

  const compoundYear = await gdb.academicYear.findUnique({
    where: { schoolId_name: { schoolId: greenwood.id, name: "2026-27" } },
  });
  check(
    "a second compound unique also resolves",
    compoundYear !== null,
    "academicYear.schoolId_name",
  );

  // -- an explicit but wrong filter must not override the scope -------------
  const spoofed = await gdb.student.findMany({
    where: { schoolId: sunrise.id },
    select: { id: true },
  });
  check(
    "a caller-supplied foreign schoolId cannot override the scope",
    spoofed.length === 0,
    "injected scope wins over caller input",
  );

  // -- create injects schoolId ---------------------------------------------
  const created = await gdb.student.create({
    data: {
      admissionNo: `ISO-TEST-${Date.now()}`,
      firstName: "Isolation",
      lastName: "Probe",
    } as never,
  });
  check("create injects the scoped schoolId", created.schoolId === greenwood.id);

  const visibleToOther = await sdb.student.findUnique({ where: { id: created.id } });
  check("the created row is invisible to the other tenant", visibleToOther === null);

  // -- update / delete cannot reach across tenants --------------------------
  const crossUpdate = await sdb.student.updateMany({
    where: { id: created.id },
    data: { firstName: "Hijacked" },
  });
  check("updateMany cannot touch another tenant's row", crossUpdate.count === 0);

  const crossDelete = await sdb.student.deleteMany({ where: { id: created.id } });
  check("deleteMany cannot remove another tenant's row", crossDelete.count === 0);

  const stillThere = await gdb.student.findUnique({ where: { id: created.id } });
  check("the row survived both cross-tenant attempts", stillThere !== null);

  await gdb.student.delete({ where: { id: created.id } });
  const cleaned = await gdb.student.findUnique({ where: { id: created.id } });
  check("scoped delete removes the tenant's own row", cleaned === null);

  // -- non-tenant models pass through untouched -----------------------------
  const lines = await gdb.invoiceLine.findMany({ take: 1 });
  check(
    "detail models without schoolId still query successfully",
    Array.isArray(lines),
    "InvoiceLine reaches its tenant through its parent invoice",
  );

  console.log(
    failures === 0
      ? "\nAll isolation checks passed.\n"
      : `\n${failures} isolation check(s) FAILED.\n`,
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
