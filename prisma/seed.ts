/**
 * Seeds two tenants so multi-tenant isolation is observable from the first run:
 *
 *   • Greenwood International School  (rich demo data)
 *   • Sunrise Public School           (a second tenant, deliberately sparse)
 *
 * Idempotent: re-running upserts the same records rather than duplicating them.
 * Run with `npx prisma db seed`.
 */

import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { ROLE_PRESETS } from "../src/lib/permissions";

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

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness — same seed data on every run.
// ---------------------------------------------------------------------------

let rngState = 42;
function random(): number {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}
function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
function chance(probability: number): boolean {
  return random() < probability;
}

const FIRST_NAMES_M = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Reyansh","Krishna","Ishaan","Kabir","Rohan","Dhruv","Karan","Neel","Yash","Aryan","Rudra","Parth","Manav","Tanish"];
const FIRST_NAMES_F = ["Aadhya","Ananya","Diya","Ira","Myra","Sara","Aarohi","Anika","Navya","Kiara","Riya","Meera","Tara","Isha","Nitya","Saanvi","Pari","Avni","Zara","Kavya"];
const LAST_NAMES = ["Sharma","Verma","Patel","Reddy","Nair","Iyer","Singh","Gupta","Mehta","Joshi","Kulkarni","Desai","Chopra","Malhotra","Bose","Banerjee","Rao","Pillai","Kapoor","Shah"];
const OCCUPATIONS = ["Engineer","Doctor","Teacher","Business Owner","Accountant","Architect","Lawyer","Civil Servant","Farmer","Consultant"];

const SUBJECTS = [
  { name: "English", code: "ENG", periods: 6 },
  { name: "Mathematics", code: "MAT", periods: 6 },
  { name: "Science", code: "SCI", periods: 6 },
  { name: "Social Studies", code: "SST", periods: 4 },
  { name: "Hindi", code: "HIN", periods: 4 },
  { name: "Computer Science", code: "CSC", periods: 3 },
];
const CO_SCHOLASTIC = [
  { name: "Physical Education", code: "PED", periods: 2 },
  { name: "Art & Craft", code: "ART", periods: 2 },
];

async function main() {
  console.log("Seeding…");

  const passwordHash = await bcrypt.hash("Password123", 12);

  const greenwood = await seedSchool({
    slug: "greenwood",
    name: "Greenwood International School",
    code: "GIS",
    city: "Bengaluru",
    state: "Karnataka",
    primaryColor: "#4f46e5",
    board: "CBSE",
    plan: "PREMIUM",
    passwordHash,
    rich: true,
  });

  const sunrise = await seedSchool({
    slug: "sunrise",
    name: "Sunrise Public School",
    code: "SPS",
    city: "Pune",
    state: "Maharashtra",
    primaryColor: "#0d9488",
    board: "State Board",
    plan: "BASIC",
    passwordHash,
    rich: false,
  });

  console.log("\nSeed complete.\n");
  console.log("Sign in at http://localhost:3000/login");
  console.log("Password for every demo account: Password123\n");
  for (const school of [greenwood, sunrise]) {
    console.log(`  ${school.name} (/${school.slug})`);
    for (const account of school.accounts) {
      console.log(`    ${account.role.padEnd(18)} ${account.email}`);
    }
    console.log("");
  }
}

interface SeedSchoolOptions {
  slug: string;
  name: string;
  code: string;
  city: string;
  state: string;
  primaryColor: string;
  board: string;
  plan: "TRIAL" | "BASIC" | "STANDARD" | "PREMIUM" | "ENTERPRISE";
  passwordHash: string;
  rich: boolean;
}

async function seedSchool(options: SeedSchoolOptions) {
  const {
    slug, name, code, city, state, primaryColor, board, plan, passwordHash, rich,
  } = options;

  console.log(`\n▸ ${name}`);

  const school = await prisma.school.upsert({
    where: { slug },
    update: { name },
    create: {
      slug,
      name,
      legalName: `${name} Trust`,
      code,
      email: `office@${slug}.edu.in`,
      phone: `+9180${randomInt(10000000, 99999999)}`,
      website: `https://${slug}.edu.in`,
      addressLine1: `${randomInt(1, 200)}, Education Road`,
      city,
      state,
      postalCode: `${randomInt(100000, 999999)}`,
      primaryColor,
      board,
      affiliationNo: `${randomInt(1000000, 9999999)}`,
      plan,
      maxStudents: 2000,
      settings: {
        modules: {
          transport: true, hostel: rich, library: true,
          payroll: true, ai: true, biometric: rich,
        },
        attendance: { mode: rich ? "PERIOD" : "DAILY", notifyGuardianOnAbsence: true },
        fees: { lateFeeEnabled: true, onlinePaymentEnabled: true },
      },
    },
  });

  // -- Roles ---------------------------------------------------------------
  const roles = new Map<string, string>();
  for (const preset of ROLE_PRESETS) {
    const role = await prisma.role.upsert({
      where: { schoolId_key: { schoolId: school.id, key: preset.key } },
      update: { permissions: preset.permissions, name: preset.name },
      create: {
        schoolId: school.id,
        key: preset.key,
        name: preset.name,
        description: preset.description,
        permissions: preset.permissions,
        isSystem: true,
      },
    });
    roles.set(preset.key, role.id);
  }
  console.log(`  roles: ${roles.size}`);

  // -- Academic year -------------------------------------------------------
  const yearName = "2026-27";
  const academicYear = await prisma.academicYear.upsert({
    where: { schoolId_name: { schoolId: school.id, name: yearName } },
    update: { isCurrent: true },
    create: {
      schoolId: school.id,
      name: yearName,
      startDate: new Date("2026-04-01"),
      endDate: new Date("2027-03-31"),
      isCurrent: true,
    },
  });

  // -- Departments & designations -----------------------------------------
  const deptNames = ["Languages", "Mathematics", "Sciences", "Humanities", "Computer Science", "Administration"];
  const departments = new Map<string, string>();
  for (const deptName of deptNames) {
    const dept = await prisma.department.upsert({
      where: { schoolId_name: { schoolId: school.id, name: deptName } },
      update: {},
      create: { schoolId: school.id, name: deptName },
    });
    departments.set(deptName, dept.id);
  }

  const designations = new Map<string, string>();
  for (const [index, title] of ["Principal", "Vice Principal", "Head of Department", "Senior Teacher", "Teacher", "Lab Assistant", "Accountant", "Librarian"].entries()) {
    const designation = await prisma.designation.upsert({
      where: { schoolId_name: { schoolId: school.id, name: title } },
      update: {},
      create: { schoolId: school.id, name: title, rank: index },
    });
    designations.set(title, designation.id);
  }

  // -- Subjects ------------------------------------------------------------
  const subjectIds = new Map<string, string>();
  for (const subject of [...SUBJECTS, ...CO_SCHOLASTIC]) {
    const isCo = CO_SCHOLASTIC.some((entry) => entry.code === subject.code);
    const record = await prisma.subject.upsert({
      where: { schoolId_code: { schoolId: school.id, code: subject.code } },
      update: {},
      create: {
        schoolId: school.id,
        name: subject.name,
        code: subject.code,
        isCoScholastic: isCo,
        isGraded: !isCo,
        departmentId:
          departments.get(
            subject.code === "MAT" ? "Mathematics"
            : subject.code === "SCI" ? "Sciences"
            : subject.code === "CSC" ? "Computer Science"
            : subject.code === "SST" ? "Humanities"
            : "Languages",
          ) ?? null,
      },
    });
    subjectIds.set(subject.code, record.id);
  }

  // -- Class levels & sections --------------------------------------------
  const classCount = rich ? 10 : 5;
  const sectionNames = rich ? ["A", "B"] : ["A"];
  const classLevels: { id: string; name: string; order: number }[] = [];
  const sections: { id: string; classLevelId: string; label: string; order: number }[] = [];

  for (let grade = 1; grade <= classCount; grade += 1) {
    const levelName = `Class ${grade}`;
    const level = await prisma.classLevel.upsert({
      where: { schoolId_name: { schoolId: school.id, name: levelName } },
      update: {},
      create: { schoolId: school.id, name: levelName, numericOrder: grade },
    });
    classLevels.push({ id: level.id, name: levelName, order: grade });

    for (const sectionName of sectionNames) {
      const section = await prisma.section.upsert({
        where: {
          academicYearId_classLevelId_name: {
            academicYearId: academicYear.id,
            classLevelId: level.id,
            name: sectionName,
          },
        },
        update: {},
        create: {
          schoolId: school.id,
          academicYearId: academicYear.id,
          classLevelId: level.id,
          name: sectionName,
          capacity: 40,
          roomNumber: `${grade}0${sectionNames.indexOf(sectionName) + 1}`,
        },
      });
      sections.push({
        id: section.id,
        classLevelId: level.id,
        label: `${levelName} ${sectionName}`,
        order: grade,
      });
    }
  }
  console.log(`  classes: ${classLevels.length}, sections: ${sections.length}`);

  // -- Staff ---------------------------------------------------------------
  const accounts: { role: string; email: string }[] = [];

  async function createStaffUser(input: {
    roleKey: string;
    firstName: string;
    lastName: string;
    email: string;
    employeeId: string;
    staffType: "TEACHING" | "NON_TEACHING" | "ADMINISTRATIVE" | "MANAGEMENT";
    designation: string;
    department?: string;
    /** Stated by the caller so it always agrees with the chosen name. */
    gender?: "MALE" | "FEMALE";
  }) {
    const user = await prisma.user.upsert({
      where: { schoolId_email: { schoolId: school.id, email: input.email } },
      // Refreshed for the same reason the staff row is: the login and the
      // staff record are one person, so their names must not drift apart on a
      // re-run when the generated name changes.
      update: { firstName: input.firstName, lastName: input.lastName },
      create: {
        schoolId: school.id,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        status: "ACTIVE",
        emailVerified: new Date(),
        phone: `+9198${randomInt(10000000, 99999999)}`,
        roles: { connect: [{ id: roles.get(input.roleKey)! }] },
      },
    });

    const staff = await prisma.staffMember.upsert({
      where: { schoolId_employeeId: { schoolId: school.id, employeeId: input.employeeId } },
      // Name and gender are generated as a pair, so they are refreshed as a
      // pair. Updating gender alone would pin a newly-computed gender onto a
      // name stored by an earlier run and reintroduce the mismatch.
      update: {
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender ?? null,
      },
      create: {
        schoolId: school.id,
        userId: user.id,
        employeeId: input.employeeId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: user.phone,
        staffType: input.staffType,
        employmentStatus: "ACTIVE",
        joiningDate: new Date(2020 + randomInt(0, 5), randomInt(0, 11), randomInt(1, 28)),
        gender: input.gender ?? null,
        departmentId: input.department ? departments.get(input.department) ?? null : null,
        designationId: designations.get(input.designation) ?? null,
        qualification: pick(["B.Ed", "M.Ed", "M.Sc, B.Ed", "M.A, B.Ed", "MCA"]),
        experience: randomInt(2, 20),
      },
    });

    accounts.push({ role: input.roleKey, email: input.email });
    return { user, staff };
  }

  await createStaffUser({
    roleKey: "SUPER_ADMIN", firstName: "System", lastName: "Administrator",
    email: `admin@${slug}.edu.in`, employeeId: "EMP0001",
    staffType: "ADMINISTRATIVE", designation: "Principal", department: "Administration",
  });

  const principal = await createStaffUser({
    roleKey: "PRINCIPAL", firstName: "Radhika", lastName: "Menon",
    email: `principal@${slug}.edu.in`, employeeId: "EMP0002",
    staffType: "MANAGEMENT", designation: "Principal", department: "Administration",
    gender: "FEMALE",
  });

  await createStaffUser({
    roleKey: "ACCOUNTANT", firstName: "Suresh", lastName: "Iyer",
    email: `accounts@${slug}.edu.in`, employeeId: "EMP0003",
    staffType: "ADMINISTRATIVE", designation: "Accountant", department: "Administration",
    gender: "MALE",
  });

  await createStaffUser({
    roleKey: "LIBRARIAN", firstName: "Fatima", lastName: "Khan",
    email: `library@${slug}.edu.in`, employeeId: "EMP0004",
    staffType: "NON_TEACHING", designation: "Librarian", department: "Administration",
    gender: "FEMALE",
  });

  if (rich) {
    await createStaffUser({
      roleKey: "TRANSPORT_MANAGER", firstName: "Vikram", lastName: "Singh",
      email: `transport@${slug}.edu.in`, employeeId: "EMP0005",
      staffType: "NON_TEACHING", designation: "Lab Assistant", department: "Administration",
      gender: "MALE",
    });
    await createStaffUser({
      roleKey: "HOSTEL_WARDEN", firstName: "Anita", lastName: "Desai",
      email: `hostel@${slug}.edu.in`, employeeId: "EMP0006",
      staffType: "NON_TEACHING", designation: "Senior Teacher", department: "Administration",
      gender: "FEMALE",
    });
  }

  // Teachers — one per section, doubling as class teacher.
  const teachers: { id: string; name: string }[] = [];
  for (const [index, section] of sections.entries()) {
    const isFemale = chance(0.6);
    const firstName = pick(isFemale ? FIRST_NAMES_F : FIRST_NAMES_M);
    const lastName = pick(LAST_NAMES);
    const employeeId = `EMP${String(100 + index).padStart(4, "0")}`;
    const email = `teacher${index + 1}@${slug}.edu.in`;

    const { staff } = await createStaffUser({
      roleKey: "TEACHER", firstName, lastName, email, employeeId,
      staffType: "TEACHING", designation: "Teacher",
      department: pick(deptNames.slice(0, 5)),
      // The same flip that chose which name list to draw from.
      gender: isFemale ? "FEMALE" : "MALE",
    });

    teachers.push({ id: staff.id, name: `${firstName} ${lastName}` });
    await prisma.section.update({
      where: { id: section.id },
      data: { classTeacherId: staff.id },
    });
  }
  // Only the first teacher account is worth printing.
  const teacherAccounts = accounts.filter((a) => a.role === "TEACHER");
  accounts.splice(accounts.indexOf(teacherAccounts[0]) + 1, teacherAccounts.length - 1);
  console.log(`  staff: ${teachers.length + (rich ? 6 : 4)}`);

  // -- Class subjects ------------------------------------------------------
  // A running counter rather than the subject index alone, so the load is
  // spread across every teacher instead of piling onto the first few.
  let assignmentCursor = 0;
  for (const level of classLevels) {
    for (const subject of [...SUBJECTS, ...CO_SCHOLASTIC]) {
      assignmentCursor += 1;
      // Not an upsert: the composite unique includes the nullable `sectionId`,
      // and Prisma will not accept null inside a compound unique selector.
      // These rows apply to the whole class level, so sectionId stays null.
      const existing = await prisma.classSubject.findFirst({
        where: {
          classLevelId: level.id,
          sectionId: null,
          subjectId: subjectIds.get(subject.code)!,
        },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.classSubject.create({
        data: {
          classLevelId: level.id,
          subjectId: subjectIds.get(subject.code)!,
          teacherId: teachers[assignmentCursor % teachers.length]?.id ?? null,
          weeklyPeriods: subject.periods,
          maxMarks: 100,
          passMarks: 33,
        },
      });
    }
  }

  // -- Periods -------------------------------------------------------------
  const periodPlan = [
    { name: "Period 1", start: "08:00", end: "08:45" },
    { name: "Period 2", start: "08:45", end: "09:30" },
    { name: "Short Break", start: "09:30", end: "09:45", isBreak: true },
    { name: "Period 3", start: "09:45", end: "10:30" },
    { name: "Period 4", start: "10:30", end: "11:15" },
    { name: "Lunch", start: "11:15", end: "11:55", isBreak: true },
    { name: "Period 5", start: "11:55", end: "12:40" },
    { name: "Period 6", start: "12:40", end: "13:25" },
    { name: "Period 7", start: "13:25", end: "14:10" },
  ];
  const periods: { id: string; isBreak: boolean; sequence: number }[] = [];
  for (const [index, entry] of periodPlan.entries()) {
    const period = await prisma.period.upsert({
      where: { schoolId_sequence: { schoolId: school.id, sequence: index + 1 } },
      update: {},
      create: {
        schoolId: school.id,
        name: entry.name,
        sequence: index + 1,
        startTime: entry.start,
        endTime: entry.end,
        isBreak: entry.isBreak ?? false,
      },
    });
    periods.push({ id: period.id, isBreak: period.isBreak, sequence: period.sequence });
  }

  // -- Students, guardians, enrollments ------------------------------------
  const perSection = rich ? 18 : 8;
  const studentRecords: { id: string; sectionId: string; classOrder: number; name: string }[] = [];
  let admissionCounter = 1;

  for (const section of sections) {
    for (let i = 0; i < perSection; i += 1) {
      const isFemale = chance(0.48);
      const firstName = pick(isFemale ? FIRST_NAMES_F : FIRST_NAMES_M);
      const lastName = pick(LAST_NAMES);
      const admissionNo = `${code}${yearName.slice(0, 4)}${String(admissionCounter).padStart(4, "0")}`;
      admissionCounter += 1;

      const birthYear = 2026 - (5 + section.order);
      const studentEmail = `${admissionNo.toLowerCase()}@${slug}.edu.in`;

      const studentUser = await prisma.user.upsert({
        where: { schoolId_email: { schoolId: school.id, email: studentEmail } },
        update: {},
        create: {
          schoolId: school.id,
          email: studentEmail,
          firstName,
          lastName,
          passwordHash,
          status: "ACTIVE",
          roles: { connect: [{ id: roles.get("STUDENT")! }] },
        },
      });

      const student = await prisma.student.upsert({
        where: { schoolId_admissionNo: { schoolId: school.id, admissionNo } },
        update: {},
        create: {
          schoolId: school.id,
          userId: studentUser.id,
          admissionNo,
          rollNumber: String(i + 1),
          firstName,
          lastName,
          email: studentEmail,
          dateOfBirth: new Date(birthYear, randomInt(0, 11), randomInt(1, 28)),
          gender: isFemale ? "FEMALE" : "MALE",
          bloodGroup: pick(["A+", "B+", "O+", "AB+", "A-", "O-"]),
          nationality: "Indian",
          category: pick(["General", "OBC", "SC", "ST"]),
          admissionDate: new Date(2026, 3, randomInt(1, 20)),
          status: "ACTIVE",
          city,
          state,
          addressLine1: `${randomInt(1, 400)}, ${pick(["Rose", "Lake", "Park", "Hill", "Garden"])} Avenue`,
          postalCode: `${randomInt(100000, 999999)}`,
        },
      });

      // Guardian — father, also the fee payer and portal login.
      const guardianFirst = pick(FIRST_NAMES_M);
      const guardianEmail = `parent.${admissionNo.toLowerCase()}@${slug}.edu.in`;
      const guardianUser = await prisma.user.upsert({
        where: { schoolId_email: { schoolId: school.id, email: guardianEmail } },
        update: {},
        create: {
          schoolId: school.id,
          email: guardianEmail,
          firstName: guardianFirst,
          lastName,
          passwordHash,
          status: "ACTIVE",
          phone: `+9199${randomInt(10000000, 99999999)}`,
          roles: { connect: [{ id: roles.get("PARENT")! }] },
        },
      });

      const guardian = await prisma.guardian.upsert({
        where: { userId: guardianUser.id },
        update: {},
        create: {
          schoolId: school.id,
          userId: guardianUser.id,
          firstName: guardianFirst,
          lastName,
          email: guardianEmail,
          phone: guardianUser.phone!,
          occupation: pick(OCCUPATIONS),
          annualIncome: randomInt(3, 40) * 100000,
          qualification: pick(["B.Tech", "MBA", "B.Com", "M.Sc", "B.A"]),
          city,
          state,
        },
      });

      await prisma.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
        update: {},
        create: {
          studentId: student.id,
          guardianId: guardian.id,
          relationship: "FATHER",
          isPrimary: true,
          isFeePayer: true,
        },
      });

      await prisma.enrollment.upsert({
        where: { studentId_academicYearId: { studentId: student.id, academicYearId: academicYear.id } },
        update: {},
        create: {
          schoolId: school.id,
          studentId: student.id,
          sectionId: section.id,
          academicYearId: academicYear.id,
          rollNumber: String(i + 1),
          isActive: true,
        },
      });

      studentRecords.push({
        id: student.id,
        sectionId: section.id,
        classOrder: section.order,
        name: `${firstName} ${lastName}`,
      });
    }
  }
  console.log(`  students: ${studentRecords.length} (with guardians)`);

  if (accounts.length > 0 && studentRecords.length > 0) {
    const sample = studentRecords[0];
    const sampleStudent = await prisma.student.findUnique({
      where: { id: sample.id },
      select: { email: true, guardians: { include: { guardian: true } } },
    });
    if (sampleStudent?.email) accounts.push({ role: "STUDENT", email: sampleStudent.email });
    const parentEmail = sampleStudent?.guardians[0]?.guardian.email;
    if (parentEmail) accounts.push({ role: "PARENT", email: parentEmail });
  }

  // -- Grading scheme ------------------------------------------------------
  const scheme = await prisma.gradingScheme.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "CBSE Grading" } },
    update: {},
    create: {
      schoolId: school.id,
      name: "CBSE Grading",
      kind: "CBSE_CCE",
      isDefault: true,
      bands: {
        create: [
          { grade: "A1", minPercent: 91, maxPercent: 100, gradePoint: 10, remark: "Outstanding" },
          { grade: "A2", minPercent: 81, maxPercent: 90.99, gradePoint: 9, remark: "Excellent" },
          { grade: "B1", minPercent: 71, maxPercent: 80.99, gradePoint: 8, remark: "Very Good" },
          { grade: "B2", minPercent: 61, maxPercent: 70.99, gradePoint: 7, remark: "Good" },
          { grade: "C1", minPercent: 51, maxPercent: 60.99, gradePoint: 6, remark: "Fair" },
          { grade: "C2", minPercent: 41, maxPercent: 50.99, gradePoint: 5, remark: "Average" },
          { grade: "D", minPercent: 33, maxPercent: 40.99, gradePoint: 4, remark: "Needs Improvement" },
          { grade: "E", minPercent: 0, maxPercent: 32.99, gradePoint: 0, remark: "Unsatisfactory" },
        ],
      },
    },
  });

  // -- Fee categories & structures ----------------------------------------
  const feeHeads = [
    { name: "Tuition Fee", code: "TUITION", frequency: "QUARTERLY", base: 12000 },
    { name: "Admission Fee", code: "ADMISSION", frequency: "ONE_TIME", base: 15000 },
    { name: "Examination Fee", code: "EXAM", frequency: "HALF_YEARLY", base: 2500 },
    { name: "Laboratory Fee", code: "LAB", frequency: "ANNUAL", base: 3500 },
    { name: "Library Fee", code: "LIBRARY", frequency: "ANNUAL", base: 1200 },
    { name: "Sports & Activities", code: "SPORTS", frequency: "ANNUAL", base: 2000 },
    { name: "Transport Fee", code: "TRANSPORT", frequency: "MONTHLY", base: 1800 },
  ];
  const feeCategoryIds = new Map<string, string>();
  for (const head of feeHeads) {
    const category = await prisma.feeCategory.upsert({
      where: { schoolId_code: { schoolId: school.id, code: head.code } },
      update: {},
      create: {
        schoolId: school.id,
        name: head.name,
        code: head.code,
        frequency: head.frequency,
        ledgerCode: `4${randomInt(100, 999)}`,
      },
    });
    feeCategoryIds.set(head.code, category.id);
  }

  await prisma.feeConcession.upsert({
    where: { schoolId_code: { schoolId: school.id, code: "SIBLING" } },
    update: {},
    create: {
      schoolId: school.id, name: "Sibling Discount", code: "SIBLING",
      type: "PERCENTAGE", value: 10,
      description: "10% off tuition for the second and subsequent child.",
    },
  });
  await prisma.feeConcession.upsert({
    where: { schoolId_code: { schoolId: school.id, code: "MERIT" } },
    update: {},
    create: {
      schoolId: school.id, name: "Merit Scholarship", code: "MERIT",
      type: "PERCENTAGE", value: 25,
      description: "25% off tuition for students scoring above 90%.",
    },
  });

  await prisma.lateFeeRule.upsert({
    where: { id: `${school.id}-latefee` },
    update: {},
    create: {
      id: `${school.id}-latefee`,
      schoolId: school.id,
      name: "Standard late fee",
      graceDays: 7,
      chargeType: "PER_DAY",
      amount: 50,
      maxAmount: 2000,
    },
  });

  // One structure per class level, scaled by grade.
  const structureByLevel = new Map<string, string>();
  for (const level of classLevels) {
    const multiplier = 1 + (level.order - 1) * 0.08;

    // Re-running the seed must not stack a second structure onto the same
    // class: `create` has no natural unique key here, so check first.
    const existingStructure = await prisma.feeStructure.findFirst({
      where: { schoolId: school.id, academicYearId: academicYear.id, classLevelId: level.id },
      select: { id: true },
    });
    if (existingStructure) {
      structureByLevel.set(level.id, existingStructure.id);
      continue;
    }

    const structure = await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        classLevelId: level.id,
        name: `${level.name} — ${yearName}`,
        items: {
          create: [
            ...[1, 2, 3, 4].map((installment) => ({
              feeCategoryId: feeCategoryIds.get("TUITION")!,
              amount: Math.round(12000 * multiplier),
              installment,
              label: `Quarter ${installment}`,
              dueDate: new Date(2026, 3 + (installment - 1) * 3, 10),
            })),
            { feeCategoryId: feeCategoryIds.get("EXAM")!, amount: 2500, installment: 1, label: "Term 1", dueDate: new Date(2026, 8, 10) },
            { feeCategoryId: feeCategoryIds.get("EXAM")!, amount: 2500, installment: 2, label: "Term 2", dueDate: new Date(2027, 1, 10) },
            { feeCategoryId: feeCategoryIds.get("LAB")!, amount: Math.round(3500 * multiplier), installment: 1, dueDate: new Date(2026, 3, 10) },
            { feeCategoryId: feeCategoryIds.get("LIBRARY")!, amount: 1200, installment: 1, dueDate: new Date(2026, 3, 10) },
            { feeCategoryId: feeCategoryIds.get("SPORTS")!, amount: 2000, installment: 1, dueDate: new Date(2026, 3, 10) },
          ],
        },
      },
    });
    structureByLevel.set(level.id, structure.id);
  }
  console.log(`  fee structures: ${structureByLevel.size}`);

  await seedInvoicesAndPayments({
    school, academicYear, sections, studentRecords, structureByLevel, feeCategoryIds, code,
  });

  await seedAttendance({ school, academicYear, studentRecords, rich });

  await seedExams({
    school, academicYear, classLevels, sections, subjectIds, studentRecords, scheme, teachers,
  });

  await seedTimetable({ school, academicYear, sections, periods, subjectIds, teachers, classLevels });

  await seedLibrary({ school, studentRecords });

  if (rich) {
    await seedTransport({ school, academicYear, studentRecords, city });
    await seedHostel({ school, academicYear, studentRecords, principalStaffId: principal.staff.id });
  }

  await seedAdmissions({ school, academicYear, classLevels, code, city, state });
  await seedHrAndPayroll({ school, teachers });
  await seedCommunication({ school, sections, subjectIds, studentRecords, teachers, principalUserId: principal.user.id });
  await seedConversations({ school, teachers, principalUserId: principal.user.id });
  await seedExpenses({ school });

  return { name, slug, accounts };
}

// ---------------------------------------------------------------------------
// Module seeders
// ---------------------------------------------------------------------------

async function seedInvoicesAndPayments(ctx: {
  school: { id: string };
  academicYear: { id: string };
  sections: { id: string; classLevelId: string }[];
  studentRecords: { id: string; sectionId: string; classOrder: number }[];
  structureByLevel: Map<string, string>;
  feeCategoryIds: Map<string, string>;
  code: string;
}) {
  const { school, academicYear, sections, studentRecords, structureByLevel, feeCategoryIds, code } = ctx;

  // Invoice and receipt numbers are generated from a counter, so a second
  // run would collide on (schoolId, invoiceNo). Seed once.
  if (await prisma.invoice.count({ where: { schoolId: school.id } })) {
    console.log("  invoices: already seeded, skipped");
    return;
  }

  const sectionToLevel = new Map(sections.map((s) => [s.id, s.classLevelId]));
  let invoiceCounter = 1;
  let receiptCounter = 1;
  let paidCount = 0;
  let overdueCount = 0;

  for (const student of studentRecords) {
    const levelId = sectionToLevel.get(student.sectionId)!;
    const structureId = structureByLevel.get(levelId);
    if (!structureId) continue;

    const items = await prisma.feeStructureItem.findMany({
      where: { structureId },
      include: { feeCategory: true },
    });

    // Two invoices per student: Term 1 (settled or overdue) and Term 2 (open).
    for (const term of [1, 2]) {
      const termItems = items.filter((item) =>
        term === 1 ? item.installment <= 2 : item.installment > 2,
      );
      if (termItems.length === 0) continue;

      const subtotal = termItems.reduce((sum, item) => sum + Number(item.amount), 0);
      const dueDate = term === 1 ? new Date(2026, 5, 10) : new Date(2026, 10, 10);
      const invoiceNo = `INV${code}${String(invoiceCounter).padStart(5, "0")}`;
      invoiceCounter += 1;

      const isPaid = term === 1 ? chance(0.78) : chance(0.35);
      const isOverdue = !isPaid && dueDate < new Date();
      const amountPaid = isPaid ? subtotal : chance(0.3) ? Math.round(subtotal * 0.5) : 0;

      const invoice = await prisma.invoice.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          academicYearId: academicYear.id,
          structureId,
          invoiceNo,
          issueDate: new Date(2026, term === 1 ? 3 : 9, 1),
          dueDate,
          period: term === 1 ? "Term 1" : "Term 2",
          subtotal,
          total: subtotal,
          amountPaid,
          amountDue: subtotal - amountPaid,
          status: isPaid ? "PAID" : amountPaid > 0 ? "PARTIALLY_PAID" : isOverdue ? "OVERDUE" : "ISSUED",
          lines: {
            create: termItems.map((item) => ({
              feeCategoryId: item.feeCategoryId,
              description: `${item.feeCategory.name}${item.label ? ` — ${item.label}` : ""}`,
              amount: item.amount,
              lineTotal: item.amount,
              installment: item.installment,
            })),
          },
        },
      });

      if (isPaid) paidCount += 1;
      if (isOverdue) overdueCount += 1;

      if (amountPaid > 0) {
        const mode = pick(["UPI", "NETBANKING", "CASH", "CARD"] as const);
        const payment = await prisma.payment.create({
          data: {
            schoolId: school.id,
            studentId: student.id,
            receiptNo: `RCP${code}${String(receiptCounter).padStart(5, "0")}`,
            amount: amountPaid,
            mode,
            status: "SUCCESS",
            paidAt: new Date(dueDate.getTime() - randomInt(1, 20) * 86400000),
            gateway: mode === "CASH" ? null : "razorpay",
            gatewayPaymentId: mode === "CASH" ? null : `pay_${Math.random().toString(36).slice(2, 16)}`,
            transactionRef: `TXN${randomInt(100000, 999999)}`,
          },
        });
        receiptCounter += 1;

        await prisma.paymentAllocation.create({
          data: { paymentId: payment.id, invoiceId: invoice.id, amount: amountPaid },
        });
      }
    }
  }
  console.log(`  invoices: ${invoiceCounter - 1} (${paidCount} paid, ${overdueCount} overdue), receipts: ${receiptCounter - 1}`);
  void feeCategoryIds;
}

async function seedAttendance(ctx: {
  school: { id: string };
  academicYear: { id: string };
  studentRecords: { id: string; sectionId: string }[];
  rich: boolean;
}) {
  const { school, academicYear, studentRecords, rich } = ctx;

  const days: Date[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < (rich ? 45 : 20)) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }

  // A handful of students get a deliberately poor pattern so the AI
  // anomaly detector and dropout-risk model have something real to find.
  const strugglers = new Set(
    studentRecords.filter(() => chance(0.06)).map((student) => student.id),
  );

  const rows: {
    schoolId: string; studentId: string; sectionId: string; academicYearId: string;
    date: Date; status: "PRESENT" | "ABSENT" | "LATE"; source: "MANUAL" | "BIOMETRIC";
  }[] = [];

  for (const student of studentRecords) {
    const struggling = strugglers.has(student.id);
    for (const date of days) {
      const absentChance = struggling ? 0.42 : 0.05;
      const lateChance = struggling ? 0.18 : 0.04;
      const roll = random();
      const status = roll < absentChance ? "ABSENT" : roll < absentChance + lateChance ? "LATE" : "PRESENT";
      rows.push({
        schoolId: school.id,
        studentId: student.id,
        sectionId: student.sectionId,
        academicYearId: academicYear.id,
        date,
        status,
        source: rich ? "BIOMETRIC" : "MANUAL",
      });
    }
  }

  // createMany is far faster than per-row inserts at this volume.
  await prisma.attendanceRecord.createMany({ data: rows, skipDuplicates: true });
  console.log(`  attendance: ${rows.length} records over ${days.length} days (${strugglers.size} at-risk patterns)`);
}

async function seedExams(ctx: {
  school: { id: string };
  academicYear: { id: string };
  classLevels: { id: string; name: string; order: number }[];
  sections: { id: string; classLevelId: string }[];
  subjectIds: Map<string, string>;
  studentRecords: { id: string; sectionId: string }[];
  scheme: { id: string };
  teachers: { id: string }[];
}) {
  const { school, academicYear, classLevels, sections, subjectIds, studentRecords, teachers } = ctx;

  if (await prisma.exam.count({ where: { schoolId: school.id } })) {
    console.log("  exams: already seeded, skipped");
    return;
  }

  const term = await prisma.examTerm.upsert({
    where: { academicYearId_name: { academicYearId: academicYear.id, name: "Term 1" } },
    update: {},
    create: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      name: "Term 1",
      sequence: 1,
      startDate: new Date(2026, 8, 15),
      endDate: new Date(2026, 8, 26),
      weightage: 50,
    },
  });

  await prisma.examTerm.upsert({
    where: { academicYearId_name: { academicYearId: academicYear.id, name: "Term 2" } },
    update: {},
    create: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      name: "Term 2",
      sequence: 2,
      startDate: new Date(2027, 1, 15),
      endDate: new Date(2027, 1, 26),
      weightage: 50,
    },
  });

  const sectionsByLevel = new Map<string, string[]>();
  for (const section of sections) {
    const list = sectionsByLevel.get(section.classLevelId) ?? [];
    list.push(section.id);
    sectionsByLevel.set(section.classLevelId, list);
  }
  const studentsBySection = new Map<string, string[]>();
  for (const student of studentRecords) {
    const list = studentsBySection.get(student.sectionId) ?? [];
    list.push(student.id);
    studentsBySection.set(student.sectionId, list);
  }

  let markCount = 0;
  for (const level of classLevels) {
    for (const [subjectIndex, subject] of SUBJECTS.entries()) {
      const exam = await prisma.exam.create({
        data: {
          schoolId: school.id,
          termId: term.id,
          classLevelId: level.id,
          subjectId: subjectIds.get(subject.code)!,
          name: `Term 1 — ${subject.name}`,
          maxMarks: 100,
          passMarks: 33,
          status: "COMPLETED",
          schedules: {
            create: (sectionsByLevel.get(level.id) ?? []).map((sectionId) => ({
              sectionId,
              examDate: new Date(2026, 8, 15 + subjectIndex),
              startTime: "09:00",
              endTime: "12:00",
              roomNumber: `Hall ${subjectIndex + 1}`,
              invigilatorId: teachers[subjectIndex % teachers.length]?.id ?? null,
            })),
          },
        },
      });

      const marks: {
        schoolId: string; examId: string; studentId: string; subjectId: string;
        marksObtained: number; isAbsent: boolean;
      }[] = [];

      for (const sectionId of sectionsByLevel.get(level.id) ?? []) {
        for (const studentId of studentsBySection.get(sectionId) ?? []) {
          const centre = 45 + random() * 40;
          const score = Math.max(8, Math.min(100, Math.round(centre + (random() - 0.5) * 20)));
          marks.push({
            schoolId: school.id,
            examId: exam.id,
            studentId,
            subjectId: subjectIds.get(subject.code)!,
            marksObtained: score,
            isAbsent: false,
          });
        }
      }
      await prisma.markEntry.createMany({ data: marks, skipDuplicates: true });
      markCount += marks.length;
    }
  }
  console.log(`  exams: ${classLevels.length * SUBJECTS.length}, marks: ${markCount}`);
}

async function seedTimetable(ctx: {
  school: { id: string };
  academicYear: { id: string };
  sections: { id: string; classLevelId: string }[];
  periods: { id: string; isBreak: boolean; sequence: number }[];
  subjectIds: Map<string, string>;
  teachers: { id: string }[];
  classLevels: { id: string }[];
}) {
  const { school, academicYear, sections, periods, subjectIds, teachers } = ctx;

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
  const teachingPeriods = periods.filter((period) => !period.isBreak);
  const subjectCodes = [...SUBJECTS, ...CO_SCHOLASTIC].map((subject) => subject.code);

  const slots: {
    schoolId: string; academicYearId: string; sectionId: string; periodId: string;
    subjectId: string; teacherId: string; dayOfWeek: (typeof days)[number];
  }[] = [];

  // Round-robin subjects across the week, offsetting per section so that no two
  // sections claim the same teacher in the same period.
  for (const [sectionIndex, section] of sections.entries()) {
    for (const [dayIndex, day] of days.entries()) {
      for (const [periodIndex, period] of teachingPeriods.entries()) {
        const offset = sectionIndex + dayIndex * 2 + periodIndex;
        const code = subjectCodes[offset % subjectCodes.length];
        slots.push({
          schoolId: school.id,
          academicYearId: academicYear.id,
          sectionId: section.id,
          periodId: period.id,
          subjectId: subjectIds.get(code)!,
          teacherId: teachers[(offset + sectionIndex) % teachers.length].id,
          dayOfWeek: day,
        });
      }
    }
  }

  await prisma.timetableSlot.createMany({ data: slots, skipDuplicates: true });
  console.log(`  timetable slots: ${slots.length}`);
}

async function seedLibrary(ctx: {
  school: { id: string };
  studentRecords: { id: string }[];
}) {
  const { school, studentRecords } = ctx;

  if (await prisma.book.count({ where: { schoolId: school.id } })) {
    console.log("  library: already seeded, skipped");
    return;
  }

  const titles = [
    { title: "Wings of Fire", author: "A.P.J. Abdul Kalam", category: "Biography" },
    { title: "The Discovery of India", author: "Jawaharlal Nehru", category: "History" },
    { title: "Malgudi Days", author: "R.K. Narayan", category: "Fiction" },
    { title: "A Brief History of Time", author: "Stephen Hawking", category: "Science" },
    { title: "The Jungle Book", author: "Rudyard Kipling", category: "Fiction" },
    { title: "Introduction to Algorithms", author: "Cormen et al.", category: "Computer Science" },
    { title: "Concepts of Physics", author: "H.C. Verma", category: "Science" },
    { title: "Mathematics for Class X", author: "R.D. Sharma", category: "Textbook" },
    { title: "The Guide", author: "R.K. Narayan", category: "Fiction" },
    { title: "Panchatantra Tales", author: "Vishnu Sharma", category: "Children" },
    { title: "Train to Pakistan", author: "Khushwant Singh", category: "Fiction" },
    { title: "The Argumentative Indian", author: "Amartya Sen", category: "Essays" },
  ];

  let copyCounter = 1;
  const bookIds: string[] = [];
  for (const entry of titles) {
    const book = await prisma.book.create({
      data: {
        schoolId: school.id,
        title: entry.title,
        author: entry.author,
        category: entry.category,
        isbn: `978${randomInt(1000000000, 9999999999)}`,
        publisher: pick(["Penguin", "Oxford", "Rupa", "HarperCollins", "Bharati Bhawan"]),
        language: "English",
        publishYear: randomInt(1990, 2024),
        rackNumber: `R${randomInt(1, 20)}`,
        price: randomInt(150, 1200),
        copies: {
          create: Array.from({ length: randomInt(2, 5) }, () => ({
            accessionNo: `ACC${String(copyCounter++).padStart(5, "0")}`,
            status: "AVAILABLE" as const,
            acquiredOn: new Date(2023, randomInt(0, 11), randomInt(1, 28)),
          })),
        },
      },
    });
    bookIds.push(book.id);
  }

  // Issue a few copies, including two overdue so fines are visible.
  const copies = await prisma.bookCopy.findMany({
    where: { book: { schoolId: school.id } },
    take: 14,
  });
  let issued = 0;
  for (const [index, copy] of copies.entries()) {
    if (index % 3 !== 0) continue;
    const student = pick(studentRecords);
    const overdue = index % 9 === 0;
    const issuedOn = new Date(Date.now() - randomInt(overdue ? 25 : 3, overdue ? 40 : 12) * 86400000);
    const dueOn = new Date(issuedOn.getTime() + 14 * 86400000);

    await prisma.bookIssue.create({
      data: {
        schoolId: school.id,
        copyId: copy.id,
        studentId: student.id,
        issuedOn,
        dueOn,
        fineAmount: overdue ? Math.max(0, Math.floor((Date.now() - dueOn.getTime()) / 86400000)) * 2 : 0,
      },
    });
    await prisma.bookCopy.update({ where: { id: copy.id }, data: { status: "ISSUED" } });
    issued += 1;
  }
  console.log(`  library: ${bookIds.length} titles, ${copyCounter - 1} copies, ${issued} issued`);
}

async function seedTransport(ctx: {
  school: { id: string };
  academicYear: { id: string };
  studentRecords: { id: string }[];
  city: string;
}) {
  const { school, academicYear, studentRecords, city } = ctx;

  if (await prisma.vehicleLocationPing.count({ where: { vehicle: { schoolId: school.id } } })) {
    console.log("  transport: already seeded, skipped");
    return;
  }

  const routePlan = [
    { name: "Route A — North Corridor", stops: ["Hebbal", "Yelahanka", "Jakkur", "Sahakar Nagar"] },
    { name: "Route B — East Corridor", stops: ["Indiranagar", "Domlur", "Marathahalli", "Whitefield"] },
    { name: "Route C — South Corridor", stops: ["Jayanagar", "JP Nagar", "Banashankari", "Kanakapura Road"] },
  ];

  // All routes converge on the campus; each heads out on its own bearing.
  const CAMPUS = { lat: 12.9716, lng: 77.5946 };
  const CORRIDORS = [
    { dLat: 0.018, dLng: 0.004 }, // north
    { dLat: 0.003, dLng: 0.021 }, // east
    { dLat: -0.017, dLng: -0.006 }, // south
  ];

  let assigned = 0;
  for (const [index, plan] of routePlan.entries()) {
    const corridor = CORRIDORS[index % CORRIDORS.length];
    const vehicle = await prisma.vehicle.upsert({
      where: { schoolId_registrationNo: { schoolId: school.id, registrationNo: `KA01AB${1000 + index}` } },
      update: {},
      create: {
        schoolId: school.id,
        registrationNo: `KA01AB${1000 + index}`,
        model: pick(["Tata Starbus", "Ashok Leyland Lynx", "Force Traveller"]),
        capacity: 45,
        vehicleType: "BUS",
        // One vehicle is deliberately left with a lapsed certificate and one
        // with an imminent renewal, so the compliance alerts have something
        // real to report.
        insuranceExpiry:
          index === 0
            ? new Date(Date.now() - 12 * 86400000)
            : new Date(Date.now() + (index === 1 ? 18 : 300) * 86400000),
        fitnessExpiry: new Date(Date.now() + (index === 1 ? 25 : 240) * 86400000),
        pollutionExpiry: new Date(Date.now() + (index === 0 ? 45 : 180) * 86400000),
        lastServicedAt: new Date(Date.now() - randomInt(20, 120) * 86400000),
        gpsDeviceId: `GPS-${1000 + index}`,
        driverName: `${pick(FIRST_NAMES_M)} ${pick(LAST_NAMES)}`,
        driverPhone: `+9197${randomInt(10000000, 99999999)}`,
        driverLicense: `DL${randomInt(100000000, 999999999)}`,
      },
    });

    const route = await prisma.route.upsert({
      where: { schoolId_name: { schoolId: school.id, name: plan.name } },
      update: {},
      create: {
        schoolId: school.id,
        name: plan.name,
        code: `RT${index + 1}`,
        vehicleId: vehicle.id,
        startPoint: plan.stops[0],
        endPoint: `${city} Campus`,
        distanceKm: randomInt(12, 30),
        stops: {
          create: plan.stops.map((stop, stopIndex) => ({
            name: stop,
            sequence: stopIndex + 1,
            pickupTime: `0${6 + Math.floor(stopIndex / 2)}:${stopIndex % 2 === 0 ? "15" : "45"}`,
            dropTime: `1${5 + Math.floor(stopIndex / 2)}:${stopIndex % 2 === 0 ? "30" : "50"}`,
            // Stops march along a corridor towards the campus rather than
            // landing at random, so the tracking map reads as a real route.
            latitude: CAMPUS.lat + corridor.dLat * (plan.stops.length - stopIndex),
            longitude: CAMPUS.lng + corridor.dLng * (plan.stops.length - stopIndex),
            monthlyFare: 1500 + stopIndex * 200,
          })),
        },
      },
      include: { stops: true },
    });

    const stops = await prisma.routeStop.findMany({ where: { routeId: route.id } });

    // A recent GPS trail that interpolates along the stops, so the tracking
    // map shows the bus travelling the corridor instead of teleporting.
    const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
    const PING_COUNT = 14;
    await prisma.vehicleLocationPing.createMany({
      data: Array.from({ length: PING_COUNT }, (_, pingIndex) => {
        // 0 at the outermost stop, 1 at the campus end of the route.
        const progress = pingIndex / (PING_COUNT - 1);
        const span = (ordered.length - 1) * progress;
        const from = ordered[Math.min(ordered.length - 1, Math.floor(span))];
        const to = ordered[Math.min(ordered.length - 1, Math.floor(span) + 1)];
        const t = span - Math.floor(span);

        const lat = Number(from.latitude) + (Number(to.latitude) - Number(from.latitude)) * t;
        const lng = Number(from.longitude) + (Number(to.longitude) - Number(from.longitude)) * t;

        return {
          vehicleId: vehicle.id,
          // A little jitter so the trail looks driven, not drawn.
          latitude: lat + (random() - 0.5) * 0.0015,
          longitude: lng + (random() - 0.5) * 0.0015,
          speedKmph: randomInt(18, 46),
          heading: randomInt(0, 359),
          recordedAt: new Date(Date.now() - (PING_COUNT - 1 - pingIndex) * 90000),
        };
      }),
    });

    for (const student of studentRecords) {
      if (!chance(0.12)) continue;
      const existing = await prisma.transportAssignment.findUnique({
        where: { studentId_academicYearId: { studentId: student.id, academicYearId: academicYear.id } },
      });
      if (existing) continue;
      await prisma.transportAssignment.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          academicYearId: academicYear.id,
          routeId: route.id,
          stopId: pick(stops).id,
          direction: "BOTH",
        },
      });
      assigned += 1;
    }
  }
  console.log(`  transport: ${routePlan.length} routes, ${assigned} students assigned`);
}

async function seedHostel(ctx: {
  school: { id: string };
  academicYear: { id: string };
  studentRecords: { id: string }[];
  principalStaffId: string;
}) {
  const { school, academicYear, studentRecords, principalStaffId } = ctx;

  // Without this guard each run allocates another slice of the roll, and the
  // blocks end up holding far more residents than they have beds.
  if (await prisma.hostelAllocation.count({ where: { schoolId: school.id } })) {
    console.log("  hostel: already seeded, skipped");
    return;
  }

  // Allocation must respect the block's gender and its bed count — the same
  // two rules src/lib/hostel.ts enforces in the application.
  const genders = await prisma.student.findMany({
    where: { id: { in: studentRecords.map((student) => student.id) } },
    select: { id: true, gender: true },
  });
  const genderById = new Map(genders.map((row) => [row.id, row.gender]));

  let allocated = 0;
  for (const config of [
    { name: "Nalanda Boys Hostel", type: "BOYS" as const, gender: "MALE" },
    { name: "Takshashila Girls Hostel", type: "GIRLS" as const, gender: "FEMALE" },
  ]) {
    const hostel = await prisma.hostel.upsert({
      where: { schoolId_name: { schoolId: school.id, name: config.name } },
      update: {},
      create: {
        schoolId: school.id,
        name: config.name,
        type: config.type,
        capacity: 45,
        wardenId: principalStaffId,
        contactPhone: `+9180${randomInt(10000000, 99999999)}`,
        rooms: {
          create: Array.from({ length: 15 }, (_, index) => ({
            roomNumber: `${Math.floor(index / 5) + 1}0${(index % 5) + 1}`,
            floor: `Floor ${Math.floor(index / 5) + 1}`,
            capacity: 3,
            roomType: "TRIPLE",
            monthlyFee: 6500,
          })),
        },
      },
    });

    const rooms = await prisma.hostelRoom.findMany({
      where: { hostelId: hostel.id },
      orderBy: { roomNumber: "asc" },
    });
    const occupied = new Map<string, number>(rooms.map((room) => [room.id, 0]));

    const eligible = studentRecords.filter(
      (student) => genderById.get(student.id) === config.gender,
    );

    for (const student of eligible) {
      if (!chance(0.22)) continue;

      // Fill the first room that still has a bed; stop once the block is full.
      const room = rooms.find(
        (candidate) => (occupied.get(candidate.id) ?? 0) < candidate.capacity,
      );
      if (!room) break;

      const existing = await prisma.hostelAllocation.findUnique({
        where: {
          studentId_academicYearId: {
            studentId: student.id,
            academicYearId: academicYear.id,
          },
        },
      });
      if (existing) continue;

      const bed = (occupied.get(room.id) ?? 0) + 1;
      occupied.set(room.id, bed);

      await prisma.hostelAllocation.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          academicYearId: academicYear.id,
          roomId: room.id,
          bedNumber: String(bed),
        },
      });
      allocated += 1;
    }
  }
  console.log(`  hostel: 2 blocks, ${allocated} residents`);
}

async function seedAdmissions(ctx: {
  school: { id: string };
  academicYear: { id: string };
  classLevels: { id: string; name: string; order: number }[];
  code: string;
  city: string;
  state: string;
}) {
  const { school, academicYear, classLevels, code, city, state } = ctx;

  if (await prisma.admissionApplication.count({ where: { schoolId: school.id } })) {
    console.log("  admissions: already seeded, skipped");
    return;
  }

  // Spread applications across the funnel so the pipeline view has every
  // stage populated, weighted towards the early stages as a real intake is.
  const funnel: { status: string; weight: number }[] = [
    { status: "SUBMITTED", weight: 10 },
    { status: "UNDER_REVIEW", weight: 7 },
    { status: "SHORTLISTED", weight: 5 },
    { status: "TEST_SCHEDULED", weight: 4 },
    { status: "INTERVIEW_SCHEDULED", weight: 3 },
    { status: "OFFERED", weight: 4 },
    { status: "ACCEPTED", weight: 3 },
    { status: "REJECTED", weight: 4 },
    { status: "WITHDRAWN", weight: 2 },
    { status: "DRAFT", weight: 2 },
  ];
  const pool = funnel.flatMap((entry) => Array(entry.weight).fill(entry.status));

  const SOURCES = ["Walk-in", "Website", "Referral", "Advertisement", "Education fair"];
  let counter = 1;
  const created: string[] = [];

  for (const status of pool) {
    const isFemale = chance(0.48);
    const firstName = pick(isFemale ? FIRST_NAMES_F : FIRST_NAMES_M);
    const lastName = pick(LAST_NAMES);
    const level = pick(classLevels.slice(0, Math.min(5, classLevels.length)));
    const applicationNo = `APP${code}${String(counter).padStart(4, "0")}`;
    counter += 1;

    const submittedAt =
      status === "DRAFT"
        ? null
        : new Date(Date.now() - randomInt(3, 90) * 86400000);
    const decided = ["OFFERED", "ACCEPTED", "REJECTED"].includes(status);

    const application = await prisma.admissionApplication.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        applicationNo,
        classLevelId: level.id,
        firstName,
        lastName,
        dateOfBirth: new Date(2026 - (5 + level.order), randomInt(0, 11), randomInt(1, 28)),
        gender: isFemale ? "FEMALE" : "MALE",
        guardianName: `${pick(FIRST_NAMES_M)} ${lastName}`,
        guardianPhone: `+9199${randomInt(10000000, 99999999)}`,
        guardianEmail: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${counter}@example.com`,
        relationship: "FATHER",
        addressLine1: `${randomInt(1, 300)}, ${pick(["Rose", "Lake", "Park", "Hill"])} Avenue`,
        city,
        state,
        postalCode: `${randomInt(100000, 999999)}`,
        previousSchool: chance(0.7) ? `${pick(["St. Mary's", "Little Flower", "Sunshine", "Green Valley"])} School` : null,
        previousPercentage: chance(0.7) ? randomInt(55, 95) : null,
        status: status as never,
        source: pick(SOURCES),
        score: decided || status === "TEST_SCHEDULED" ? randomInt(40, 98) : null,
        testDate: ["TEST_SCHEDULED", "INTERVIEW_SCHEDULED", "OFFERED", "ACCEPTED", "REJECTED"].includes(status)
          ? new Date(Date.now() + randomInt(-20, 15) * 86400000)
          : null,
        interviewDate: ["INTERVIEW_SCHEDULED", "OFFERED", "ACCEPTED"].includes(status)
          ? new Date(Date.now() + randomInt(-10, 20) * 86400000)
          : null,
        decisionDate: decided ? new Date(Date.now() - randomInt(1, 20) * 86400000) : null,
        rejectionReason: status === "REJECTED" ? pick(["Seats full for this class", "Did not meet the entrance criteria", "Incomplete documentation"]) : null,
        applicationFeePaid: status !== "DRAFT" && chance(0.85),
        submittedAt,
      },
      select: { id: true, status: true },
    });
    created.push(application.id);

    // A short stage history so the detail view has a timeline to show.
    if (status !== "DRAFT") {
      await prisma.admissionEvent.create({
        data: {
          applicationId: application.id,
          fromStatus: "DRAFT",
          toStatus: "SUBMITTED",
          note: "Application submitted online.",
        },
      });
      if (status !== "SUBMITTED") {
        await prisma.admissionEvent.create({
          data: {
            applicationId: application.id,
            fromStatus: "SUBMITTED",
            toStatus: status as never,
            note: "Moved by the admissions office.",
          },
        });
      }
    }
  }

  console.log(`  admissions: ${created.length} applications across the funnel`);
}

async function seedHrAndPayroll(ctx: {
  school: { id: string };
  teachers: { id: string }[];
}) {
  const { school, teachers } = ctx;

  const structure = await prisma.salaryStructure.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "Teaching Staff — Standard" } },
    update: {},
    create: {
      schoolId: school.id,
      name: "Teaching Staff — Standard",
      components: {
        create: [
          { name: "Basic", kind: "EARNING", calculation: "FIXED", value: 0, sequence: 1 },
          { name: "House Rent Allowance", kind: "EARNING", calculation: "PERCENT_OF_BASIC", value: 40, sequence: 2 },
          { name: "Dearness Allowance", kind: "EARNING", calculation: "PERCENT_OF_BASIC", value: 15, sequence: 3 },
          { name: "Conveyance", kind: "EARNING", calculation: "FIXED", value: 1600, sequence: 4 },
          { name: "Provident Fund", kind: "DEDUCTION", calculation: "PERCENT_OF_BASIC", value: 12, sequence: 5 },
          { name: "Professional Tax", kind: "DEDUCTION", calculation: "FIXED", value: 200, sequence: 6 },
        ],
      },
    },
  });

  for (const teacher of teachers) {
    const existing = await prisma.staffSalary.findFirst({ where: { staffId: teacher.id } });
    if (existing) continue;
    await prisma.staffSalary.create({
      data: {
        staffId: teacher.id,
        structureId: structure.id,
        basicSalary: randomInt(28, 55) * 1000,
        effectiveFrom: new Date(2026, 3, 1),
      },
    });
  }

  const leaveTypes = [
    { name: "Casual Leave", code: "CL", quota: 12 },
    { name: "Sick Leave", code: "SL", quota: 10 },
    { name: "Earned Leave", code: "EL", quota: 15 },
    { name: "Maternity Leave", code: "ML", quota: 180 },
    { name: "Loss of Pay", code: "LOP", quota: 0 },
  ];
  for (const type of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { schoolId_code: { schoolId: school.id, code: type.code } },
      update: {},
      create: {
        schoolId: school.id,
        name: type.name,
        code: type.code,
        annualQuota: type.quota,
        isPaid: type.code !== "LOP",
        carryForward: type.code === "EL",
      },
    });
  }

  const casualLeave = await prisma.leaveType.findUnique({
    where: { schoolId_code: { schoolId: school.id, code: "CL" } },
  });
  if (casualLeave && !(await prisma.leaveRequest.count({ where: { schoolId: school.id } }))) {
    for (const teacher of teachers.slice(0, 4)) {
      const from = new Date(Date.now() + randomInt(2, 20) * 86400000);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + randomInt(0, 2) * 86400000);
      await prisma.leaveRequest.create({
        data: {
          schoolId: school.id,
          staffId: teacher.id,
          leaveTypeId: casualLeave.id,
          fromDate: from,
          toDate: to,
          days: Math.round((to.getTime() - from.getTime()) / 86400000) + 1,
          reason: pick(["Family function", "Medical appointment", "Personal work", "Travel"]),
          status: chance(0.5) ? "PENDING" : "APPROVED",
        },
      });
    }
  }

  const holidays = [
    { name: "Independence Day", date: new Date(2026, 7, 15) },
    { name: "Gandhi Jayanti", date: new Date(2026, 9, 2) },
    { name: "Diwali Break", date: new Date(2026, 10, 8), endDate: new Date(2026, 10, 14) },
    { name: "Christmas", date: new Date(2026, 11, 25) },
    { name: "Republic Day", date: new Date(2027, 0, 26) },
    { name: "Holi", date: new Date(2027, 2, 3) },
  ];
  for (const holiday of holidays) {
    const exists = await prisma.holiday.findFirst({
      where: { schoolId: school.id, name: holiday.name },
    });
    if (!exists) {
      await prisma.holiday.create({ data: { schoolId: school.id, ...holiday } });
    }
  }
  console.log(`  hr: payroll structure, ${leaveTypes.length} leave types, ${holidays.length} holidays`);
}

async function seedCommunication(ctx: {
  school: { id: string };
  sections: { id: string; label: string }[];
  subjectIds: Map<string, string>;
  studentRecords: { id: string; sectionId: string }[];
  teachers: { id: string }[];
  principalUserId: string;
}) {
  const { school, sections, subjectIds, studentRecords, teachers, principalUserId } = ctx;

  const alreadySeededHomework =
    (await prisma.homework.count({ where: { schoolId: school.id } })) > 0;

  const templates = [
    { key: "absence_alert", name: "Absence alert", channel: "SMS" as const, body: "Dear Parent, {{studentName}} was marked absent on {{date}}. — {{schoolName}}", variables: ["studentName", "date", "schoolName"] },
    { key: "fee_reminder", name: "Fee reminder", channel: "WHATSAPP" as const, body: "Dear Parent, invoice {{invoiceNo}} of {{amount}} for {{studentName}} is due on {{dueDate}}. Pay online: {{payLink}}", variables: ["invoiceNo", "amount", "studentName", "dueDate", "payLink"] },
    { key: "payment_receipt", name: "Payment receipt", channel: "EMAIL" as const, subject: "Receipt {{receiptNo}} — {{schoolName}}", body: "We have received {{amount}} towards {{studentName}}'s fees. Receipt no: {{receiptNo}}.", variables: ["receiptNo", "amount", "studentName", "schoolName"] },
    { key: "exam_result", name: "Result published", channel: "PUSH" as const, body: "{{studentName}}'s {{termName}} report card is now available.", variables: ["studentName", "termName"] },
    { key: "bus_delay", name: "Bus delay", channel: "WHATSAPP" as const, body: "Bus {{routeName}} is running approximately {{minutes}} minutes late today.", variables: ["routeName", "minutes"] },
  ];
  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: { schoolId_key_channel: { schoolId: school.id, key: template.key, channel: template.channel } },
      update: {},
      create: {
        schoolId: school.id,
        key: template.key,
        name: template.name,
        channel: template.channel,
        subject: template.subject ?? null,
        body: template.body,
        variables: template.variables,
      },
    });
  }

  const notices = [
    { title: "Parent–Teacher Meeting — Saturday", body: "The PTM for all classes is scheduled this Saturday from 9:00 AM to 1:00 PM in the respective classrooms. Report cards will be handed over during the meeting.", audience: ["PARENTS", "STAFF"], isPinned: true },
    { title: "Annual Sports Day", body: "Annual Sports Day will be held on the main ground. Students must report in house uniform by 7:30 AM.", audience: ["ALL"], isPinned: false },
    { title: "Term 1 fee due date extended", body: "The last date for Term 1 fee payment has been extended by one week. Late fees will apply after the revised date.", audience: ["PARENTS"], isPinned: true },
    { title: "Science Exhibition — call for entries", body: "Students of Classes 6 to 10 may submit project proposals to their science teachers by the end of this month.", audience: ["STUDENTS", "STAFF"], isPinned: false },
  ];
  for (const notice of notices) {
    const exists = await prisma.notice.findFirst({ where: { schoolId: school.id, title: notice.title } });
    if (exists) continue;
    await prisma.notice.create({
      data: {
        schoolId: school.id,
        title: notice.title,
        body: notice.body,
        audience: notice.audience,
        isPinned: notice.isPinned,
        authorId: principalUserId,
        publishedAt: new Date(Date.now() - randomInt(1, 14) * 86400000),
      },
    });
  }

  // Homework for the most recent sections, with submissions.
  let homeworkCount = 0;
  for (const section of alreadySeededHomework ? [] : sections.slice(0, Math.min(6, sections.length))) {
    for (const code of ["MAT", "ENG", "SCI"]) {
      const dueOn = new Date(Date.now() + randomInt(-3, 6) * 86400000);
      const homework = await prisma.homework.create({
        data: {
          schoolId: school.id,
          sectionId: section.id,
          subjectId: subjectIds.get(code)!,
          title: pick([
            "Chapter 4 — practice problems 1 to 15",
            "Write a 300-word essay",
            "Complete the lab record",
            "Revision worksheet",
            "Prepare a chart on the water cycle",
          ]),
          description: "Submit through the portal or hand in a hard copy to your class teacher.",
          assignedOn: new Date(Date.now() - randomInt(1, 5) * 86400000),
          dueOn,
          maxMarks: 20,
          authorId: pick(teachers).id,
        },
      });
      homeworkCount += 1;

      const sectionStudents = studentRecords.filter((student) => student.sectionId === section.id);
      await prisma.homeworkSubmission.createMany({
        data: sectionStudents.map((student) => {
          const submitted = chance(0.72);
          const late = submitted && chance(0.15);
          return {
            homeworkId: homework.id,
            studentId: student.id,
            status: submitted ? (late ? "LATE" as const : "SUBMITTED" as const) : "ASSIGNED" as const,
            submittedAt: submitted ? new Date(dueOn.getTime() - (late ? -1 : 1) * 86400000) : null,
            marksObtained: submitted && chance(0.6) ? randomInt(10, 20) : null,
          };
        }),
        skipDuplicates: true,
      });
    }
  }
  console.log(`  communication: ${templates.length} templates, ${notices.length} notices, ${homeworkCount} homework assignments`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// ---------------------------------------------------------------------------

/**
 * A handful of message threads so the Messages screen is demonstrable.
 *
 * Threads pair a teacher with a guardian, which is the realistic shape: the
 * feature exists so a parent can raise something with the class teacher.
 */
async function seedConversations(input: {
  school: { id: string };
  teachers: { id: string }[];
  principalUserId: string;
}) {
  const { school, principalUserId } = input;

  const existing = await prisma.messageThread.count({ where: { schoolId: school.id } });
  if (existing > 0) {
    console.log("  conversations: already seeded, skipped");
    return;
  }

  // `teachers` carries staff ids; a thread member is a user, so resolve the
  // login behind each staff record.
  const teacherUsers = await prisma.staffMember.findMany({
    where: { id: { in: input.teachers.map((t) => t.id) }, userId: { not: null } },
    take: 6,
    select: { userId: true },
  });
  const teachers = teacherUsers
    .map((row) => row.userId)
    .filter((id): id is string => Boolean(id));
  if (teachers.length === 0) {
    console.log("  conversations: no teacher logins, skipped");
    return;
  }

  const guardians = await prisma.guardian.findMany({
    where: { schoolId: school.id, userId: { not: null } },
    take: 6,
    select: { userId: true, firstName: true },
  });

  const scripts = [
    {
      subject: "Absence on Friday",
      lines: [
        "Good morning, Aarav will be absent on Friday for a family function.",
        "Thank you for letting me know — I have noted it on the register.",
        "Will he miss anything important that day?",
        "Only the weekly spelling test. He can take it on Monday instead.",
      ],
    },
    {
      subject: "Progress in mathematics",
      lines: [
        "I wanted to check how she is finding the algebra unit.",
        "She is doing well — her last two worksheets were both above 80%.",
        "That is a relief, thank you. Anything we should practise at home?",
        "Ten minutes of mental arithmetic a day would help with speed.",
      ],
    },
    {
      subject: "Transport route change",
      lines: [
        "We are moving house next month and will need a different pickup point.",
        "Understood. Send me the new address and I will pass it to the transport office.",
      ],
    },
  ];

  let created = 0;
  let messageCount = 0;

  for (let i = 0; i < scripts.length && i < guardians.length; i += 1) {
    const script = scripts[i];
    const guardian = guardians[i];
    const teacherUserId = teachers[i % teachers.length];
    if (!guardian.userId) continue;

    // Timestamps step backwards from a few days ago so the list has an order.
    const base = new Date();
    base.setDate(base.getDate() - (i + 1));

    const thread = await prisma.messageThread.create({
      data: {
        schoolId: school.id,
        subject: script.subject,
        kind: "DIRECT",
        lastMessageAt: new Date(base.getTime() + script.lines.length * 600_000),
        members: {
          create: [
            // The guardian has read up to their own last message; the teacher
            // has one waiting, so the unread badge has something to show.
            { userId: guardian.userId, lastReadAt: new Date(base.getTime() + 600_000) },
            { userId: teacherUserId, lastReadAt: new Date(base.getTime() + 600_000) },
          ],
        },
        messages: {
          create: script.lines.map((body, index) => ({
            senderId: index % 2 === 0 ? guardian.userId! : teacherUserId,
            body,
            createdAt: new Date(base.getTime() + index * 600_000),
          })),
        },
      },
    });

    void thread;
    created += 1;
    messageCount += script.lines.length;
  }

  // One staff-room thread so an administrator also has something to open.
  if (teachers.length >= 2) {
    const base = new Date();
    base.setHours(base.getHours() - 3);
    await prisma.messageThread.create({
      data: {
        schoolId: school.id,
        subject: "Exam duty roster",
        kind: "GROUP",
        lastMessageAt: base,
        members: {
          create: [
            { userId: principalUserId, lastReadAt: base },
            { userId: teachers[0] },
            { userId: teachers[1] },
          ],
        },
        messages: {
          create: [
            {
              senderId: principalUserId,
              body: "Draft invigilation roster for the term exams is on the notice board. Flag clashes by Friday.",
              createdAt: base,
            },
          ],
        },
      },
    });
    created += 1;
    messageCount += 1;
  }

  console.log(`  conversations: ${created} threads, ${messageCount} messages`);
}

/** Expense vouchers across the usual heads a school actually spends on. */
async function seedExpenses(input: { school: { id: string } }) {
  const { school } = input;

  const existing = await prisma.expense.count({ where: { schoolId: school.id } });
  if (existing > 0) {
    console.log("  expenses: already seeded, skipped");
    return;
  }

  const heads: { category: string; vendor: string; low: number; high: number }[] = [
    { category: "Utilities", vendor: "State Electricity Board", low: 40_000, high: 95_000 },
    { category: "Maintenance", vendor: "Sharma Facility Services", low: 8_000, high: 45_000 },
    { category: "Transport", vendor: "Bharat Fuels", low: 25_000, high: 70_000 },
    { category: "Teaching materials", vendor: "Vidya Book House", low: 5_000, high: 30_000 },
    { category: "Laboratory", vendor: "Scientific Supplies Co", low: 10_000, high: 60_000 },
    { category: "Housekeeping", vendor: "CleanCo", low: 6_000, high: 20_000 },
    { category: "IT and software", vendor: "Nimbus Systems", low: 15_000, high: 80_000 },
  ];

  const modes = ["BANK_TRANSFER", "CHEQUE", "UPI", "CASH"] as const;
  let voucher = 0;

  for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo -= 1) {
    for (const head of heads) {
      // Not every head is spent on every month — a full grid looks synthetic.
      if (monthsAgo > 0 && chance(0.35)) continue;

      const when = new Date();
      when.setMonth(when.getMonth() - monthsAgo);
      when.setDate(randomInt(1, 27));
      if (when.getTime() > Date.now()) when.setTime(Date.now());

      const amount = randomInt(head.low, head.high);
      voucher += 1;

      await prisma.expense.create({
        data: {
          schoolId: school.id,
          voucherNo: `EXP${String(voucher).padStart(5, "0")}`,
          category: head.category,
          description: `${head.category} for ${when.toLocaleString("en-IN", { month: "long" })}`,
          amount,
          // GST is charged on some heads and not others.
          taxAmount: head.category === "Utilities" ? 0 : Math.round(amount * 0.18),
          paidTo: head.vendor,
          paidAt: when,
          mode: pick([...modes]),
          referenceNo: `REF${randomInt(100000, 999999)}`,
        },
      });
    }
  }

  console.log(`  expenses: ${voucher} vouchers`);
}
