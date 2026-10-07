/**
 * Marks TODAY's attendance for every active student, so the admin dashboard's
 * "Today's attendance" tile shows a live figure during demos (it is null until
 * a register is marked for the current date).
 *
 * Idempotent: upserts on the unique [studentId, date], so re-running just
 * refreshes today's rows. ~93% PRESENT, a sprinkle of LATE/ABSENT for realism.
 *
 *   npm run seed:today-attendance
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  const placeholder = !url || url.includes("johndoe:randompassword") || /\/mydb(\?|$)/.test(url);
  return placeholder
    ? `postgresql://${process.env.USER || "postgres"}@localhost:5432/school_erp?schema=public`
    : url;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: resolveDatabaseUrl() }),
});

async function main() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Active enrolments carry the student's section + academic year for today.
  const enrolments = await prisma.enrollment.findMany({
    where: { isActive: true, student: { status: "ACTIVE" } },
    select: { schoolId: true, studentId: true, sectionId: true, academicYearId: true },
  });

  if (enrolments.length === 0) {
    console.log("No active enrolments found — nothing to mark.");
    return;
  }

  const bySchool = new Map<string, number>();
  let i = 0;
  for (const e of enrolments) {
    // Deterministic spread: ~1 in 15 absent, ~1 in 20 late, rest present.
    const status = i % 15 === 7 ? "ABSENT" : i % 20 === 3 ? "LATE" : "PRESENT";
    i += 1;
    await prisma.attendanceRecord.upsert({
      where: { studentId_date: { studentId: e.studentId, date } },
      create: {
        schoolId: e.schoolId,
        studentId: e.studentId,
        sectionId: e.sectionId,
        academicYearId: e.academicYearId,
        date,
        status,
        source: "MANUAL",
      },
      update: { status, sectionId: e.sectionId, academicYearId: e.academicYearId },
    });
    bySchool.set(e.schoolId, (bySchool.get(e.schoolId) ?? 0) + 1);
  }

  console.log(`Marked today's attendance (${date.toISOString().slice(0, 10)}) for ${enrolments.length} students across ${bySchool.size} school(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
