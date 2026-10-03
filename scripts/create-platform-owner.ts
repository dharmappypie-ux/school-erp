/**
 * One-time bootstrap: create a dedicated PLATFORM OWNER login.
 *
 * The platform owner sits ABOVE every school. Because each user must belong to
 * a school, owners live in a hidden system workspace ("Platform HQ") that holds
 * no students or staff — never a real school. The app never exposes a way to
 * grant PLATFORM_ADMIN, on purpose, so a school admin can't promote themselves;
 * this script is the out-of-band anointing of the first owner.
 *
 *   npm run create:platform-owner -- owner@vidyalaya.com "Platform Owner" [password]
 *
 * If no password is given, a one-time password is generated and printed.
 */
import { randomInt } from "node:crypto";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";
import { PLATFORM_ADMIN_PRESET, PLATFORM_WORKSPACE_SLUG } from "../src/lib/permissions";

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  const placeholder =
    !url || url.includes("johndoe:randompassword") || /\/mydb(\?|$)/.test(url);
  return placeholder
    ? `postgresql://${process.env.USER || "postgres"}@localhost:5432/school_erp?schema=public`
    : url;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: resolveDatabaseUrl() }),
});

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 8; i += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `Vidya-${suffix}`;
}

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const fullName = process.argv[3] ?? "Platform Owner";
  const providedPassword = process.argv[4];
  if (!email) {
    throw new Error('Usage: npm run create:platform-owner -- <email> "<Full Name>" [password]');
  }

  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(" ") || null;

  // The hidden system workspace that houses platform owners.
  const workspace = await prisma.school.upsert({
    where: { slug: PLATFORM_WORKSPACE_SLUG },
    update: {},
    create: {
      slug: PLATFORM_WORKSPACE_SLUG,
      name: "Platform HQ",
      legalName: "Platform Operations",
      isActive: true,
      plan: "ENTERPRISE",
    },
    select: { id: true },
  });

  const role = await prisma.role.upsert({
    where: { schoolId_key: { schoolId: workspace.id, key: PLATFORM_ADMIN_PRESET.key } },
    update: { permissions: PLATFORM_ADMIN_PRESET.permissions, name: PLATFORM_ADMIN_PRESET.name },
    create: {
      schoolId: workspace.id,
      key: PLATFORM_ADMIN_PRESET.key,
      name: PLATFORM_ADMIN_PRESET.name,
      description: PLATFORM_ADMIN_PRESET.description,
      permissions: PLATFORM_ADMIN_PRESET.permissions,
      isSystem: true,
    },
    select: { id: true },
  });

  const existing = await prisma.user.findFirst({
    where: { email },
    select: { id: true, schoolId: true },
  });
  if (existing && existing.schoolId !== workspace.id) {
    throw new Error(
      `${email} already exists as a user in another school. Choose a distinct email for the platform owner.`,
    );
  }

  const password = providedPassword || generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName,
        lastName,
        passwordHash,
        mustChangePassword: !providedPassword,
        status: "ACTIVE",
        roles: { connect: [{ id: role.id }] },
      },
    });
    console.log(`✓ Updated platform owner ${email} (password reset).`);
  } else {
    await prisma.user.create({
      data: {
        schoolId: workspace.id,
        email,
        firstName,
        lastName,
        passwordHash,
        mustChangePassword: !providedPassword,
        status: "ACTIVE",
        roles: { connect: [{ id: role.id }] },
      },
    });
    console.log(`✓ Created platform owner ${email}.`);
  }

  console.log(`  Password: ${password}`);
  console.log("  Sign in at /login, then you land on Platform → Schools.");
}

main()
  .catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
