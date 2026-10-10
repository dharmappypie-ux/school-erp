"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import {
  buildStaffPreview,
  formatEmployeeId,
  nameKey,
  parseCsv,
  roleLabelKey,
  temporaryPasswordRule,
  EMAIL_PATTERN,
  MARITAL_STATUS_VALUES,
  POLICE_VERIFICATION_VALUES,
  STAFF_TYPE_VALUES,
  type ImportIssue,
  type ParsedStaff,
} from "@/lib/staff-import";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";
import { readXlsx } from "@/lib/xlsx-reader";

export interface StaffImportState {
  ok: boolean;
  message: string;
  issues?: ImportIssue[];
  unmatchedColumns?: string[];
  matchedFields?: string[];
  /** Rows that would be created, carried back so the commit needs no re-upload. */
  preview?: ParsedStaff[];
  /** How the temporary passwords work — shown before and after the import. */
  passwordRule?: string;
  /** Set once rows have actually been written. */
  created?: number;
  /** Who was created and with which employee id; the passwords follow from it. */
  createdStaff?: {
    employeeId: string;
    name: string;
    email: string;
    /** The temporary password, so the list can actually be handed out. */
    password: string;
  }[];
}

/** 4 MB, as for students — far past any school's payroll. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Staff are capped per file where students are not.
 *
 * Every staff row creates a login, and every login needs a bcrypt hash at cost
 * 12 — a few hundred milliseconds of pure CPU each, by design. A thousand rows
 * would spend minutes hashing before the first write and risk being cut off
 * mid-run, which would roll the whole file back. A hundred at a time keeps the
 * work inside one comfortable request.
 */
/**
 * Each row hashes a password at bcrypt cost 12 — measured at ~220ms on this
 * codebase — and bcryptjs is synchronous, so the hashes run back to back and
 * Promise.all buys nothing. Fifty rows is about eleven seconds of CPU before
 * the transaction opens, which fits the function budget with room to spare;
 * a hundred would not, and the whole import would roll back after a minute of
 * waiting. A school onboarding more than fifty at once splits the file.
 */
const MAX_ROWS = 50;

async function loadContext(schoolId: string, permissions: readonly string[]) {
  const db = scopedDb(schoolId);

  // The same guard settings/users enforces one at a time. A bulk path that
  // skipped it would be a back door around role management: a spreadsheet
  // could mint a super admin that the Settings screen refuses to create.
  // PLATFORM_ADMIN is never assignable from inside a school at all.
  const forbiddenRoleKeys = [
    "STUDENT",
    "PARENT",
    "PLATFORM_ADMIN",
    ...(hasPermission(permissions, "roles.manage") ? [] : ["SUPER_ADMIN"]),
  ];

  const [users, staff, roles, departments, designations] = await Promise.all([
    // Deleted rows are included on purpose: the unique constraints are on
    // (schoolId, email) and (schoolId, employeeId) regardless of deletedAt, so
    // a soft-deleted colleague still owns that address.
    db.user.findMany({ select: { email: true } }),
    db.staffMember.findMany({ select: { employeeId: true } }),
    db.role.findMany({
      where: { key: { notIn: forbiddenRoleKeys } },
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.designation.findMany({ orderBy: { rank: "asc" }, select: { id: true, name: true } }),
  ]);

  const roleIdsByKey = new Map(roles.map((role) => [role.key, role.id]));

  // Keys first, then names: a role someone renamed to another role's key must
  // not shadow that role.
  const roleKeysByLabel = new Map<string, string>();
  for (const role of roles) {
    roleKeysByLabel.set(roleLabelKey(role.key), role.key);
  }
  for (const role of roles) {
    const label = roleLabelKey(role.name);
    if (!roleKeysByLabel.has(label)) roleKeysByLabel.set(label, role.key);
  }

  const existingEmployeeIds = new Set(
    staff.map((member) => member.employeeId.toLowerCase()),
  );

  // Where the generated ids carry on from. Taken as a numeric maximum rather
  // than the last row alphabetically, so EMP0009 does not look higher than
  // EMP0010 once a school passes its first hundred staff.
  let highest = 0;
  for (const member of staff) {
    const match = /^EMP(\d+)$/i.exec(member.employeeId.trim());
    if (match) highest = Math.max(highest, Number(match[1]));
  }

  return {
    db,
    roleIdsByKey,
    nextSequence: highest + 1,
    context: {
      existingEmails: new Set(users.map((user) => user.email.toLowerCase())),
      existingEmployeeIds,
      roleKeysByLabel,
      roleLabels: roles.map((role) => role.name),
      departmentIdsByName: new Map(
        departments.map((department) => [nameKey(department.name), department.id]),
      ),
      departmentNames: departments.map((department) => department.name),
      designationIdsByName: new Map(
        designations.map((designation) => [nameKey(designation.name), designation.id]),
      ),
      designationNames: designations.map((designation) => designation.name),
    },
  };
}

/**
 * The employee id each row will be created with, in row order.
 *
 * Supplied ids are kept; blank ones are generated in sequence. The counter is
 * advanced here, in memory, rather than re-read from the database per row —
 * otherwise every generated row in the file reads the same highest id and they
 * all collide on the first insert.
 */
function assignEmployeeIds(
  rows: { employeeId: string | null }[],
  nextSequence: number,
  existingEmployeeIds: Set<string>,
): string[] {
  const taken = new Set(existingEmployeeIds);
  for (const row of rows) {
    if (row.employeeId) taken.add(row.employeeId.toLowerCase());
  }

  let sequence = nextSequence;
  return rows.map((row) => {
    if (row.employeeId) return row.employeeId;

    let candidate = formatEmployeeId(sequence);
    // Steps over an id the file itself supplies further down, e.g. a sheet that
    // hand-writes EMP0007 while the generator is on its way past it.
    while (taken.has(candidate.toLowerCase())) {
      sequence += 1;
      candidate = formatEmployeeId(sequence);
    }
    taken.add(candidate.toLowerCase());
    sequence += 1;
    return candidate;
  });
}

/**
 * Reads the uploaded file and reports what it would do — without writing
 * anything.
 *
 * A bulk import is the one place where "just try it and see" is unaffordable,
 * and doubly so here: the commit creates sign-ins. The preview is mandatory and
 * the commit below only accepts rows this step produced.
 */
export async function previewStaffImport(
  _previous: StaffImportState,
  formData: FormData,
): Promise<StaffImportState> {
  const session = await requirePermission("staff.create");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV or Excel file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB.`,
    };
  }
  // .xls (the pre-2007 binary format) is a different beast entirely and is not
  // supported; .xlsx and .csv both are.
  if (/\.xls$/i.test(file.name)) {
    return {
      ok: false,
      message:
        "That is the old .xls format. Open it in Excel and choose File → Save As → Excel Workbook (.xlsx), then upload that.",
    };
  }

  let grid: string[][];
  if (/\.xlsx$/i.test(file.name)) {
    try {
      grid = await readXlsx(await file.arrayBuffer());
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? `That workbook could not be read: ${error.message}`
            : "That workbook could not be read.",
      };
    }
  } else {
    grid = parseCsv(await file.text());
  }

  const { nextSequence, context } = await loadContext(
    session.schoolId,
    session.permissions,
  );
  const preview = buildStaffPreview(grid, context);

  if (preview.issues.length > 0) {
    return {
      ok: false,
      message: `${preview.issues.length} problem${preview.issues.length === 1 ? "" : "s"} found. Nothing has been imported.`,
      issues: preview.issues,
      unmatchedColumns: preview.unmatchedColumns,
      matchedFields: preview.matchedFields,
      preview: preview.rows,
    };
  }

  if (preview.rows.length === 0) {
    return { ok: false, message: "No staff rows found in that file." };
  }

  if (preview.rows.length > MAX_ROWS) {
    return {
      ok: false,
      message: `That file has ${preview.rows.length} staff. Import at most ${MAX_ROWS} at a time — each one gets a login whose password has to be hashed, which is deliberately slow. Split the file and upload it in parts.`,
    };
  }

  // The example uses an id from this very file, so the rule reads as a fact
  // about these people rather than as documentation.
  const example =
    preview.rows.find((row) => row.employeeId)?.employeeId ??
    formatEmployeeId(nextSequence);

  return {
    ok: true,
    message: `${preview.rows.length} staff member${preview.rows.length === 1 ? "" : "s"} ready to import. Nothing has been written yet.`,
    issues: [],
    unmatchedColumns: preview.unmatchedColumns,
    matchedFields: preview.matchedFields,
    preview: preview.rows,
    passwordRule: temporaryPasswordRule(new Date().getFullYear(), example),
  };
}

/**
 * The shape the commit will accept.
 *
 * A server action is reachable by anyone who can POST, so the payload is
 * validated rather than trusted — and the role, department and designation on
 * each row are resolved against the school's own tables again below, so a
 * crafted payload cannot invent one.
 */
const nullableText = z.string().nullable();
const nullableDate = z.coerce.date().nullable();

const ParsedStaffSchema = z.object({
  row: z.number().int(),
  employeeId: z.string().trim().min(1).nullable(),
  firstName: z.string().trim().min(1),
  lastName: nullableText,
  // Lower-cased here as well as in the parser: this value is written straight
  // into the login, and an address stored with capitals is an address its owner
  // cannot reliably sign in with.
  // The parser's rule, not zod's stricter one. They disagreed, and the
  // disagreement was unrecoverable from the UI.
  email: z.string().trim().toLowerCase().regex(EMAIL_PATTERN, "Not an email address"),
  phone: nullableText,
  dateOfBirth: nullableDate,
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable(),
  staffType: z.enum(STAFF_TYPE_VALUES),
  roleKey: z.string().trim().min(1),
  departmentName: nullableText,
  designationName: nullableText,
  joiningDate: nullableDate,
  qualification: nullableText,
  experience: z.number().int().nullable(),
  specialisation: nullableText,
  addressLine1: nullableText,
  city: nullableText,
  state: nullableText,
  postalCode: nullableText,
  panNumber: nullableText,
  aadhaarNumber: nullableText,
  bankName: nullableText,
  bankAccountNo: nullableText,
  bankIfsc: nullableText,
  pfNumber: nullableText,
  esiNumber: nullableText,
  fatherOrHusbandName: nullableText,
  maritalStatus: z.enum(MARITAL_STATUS_VALUES).nullable(),
  policeVerificationStatus: z.enum(POLICE_VERIFICATION_VALUES),
  policeVerificationDate: nullableDate,
  policeVerificationRef: nullableText,
  drivingLicenceNo: nullableText,
  drivingLicenceExpiry: nullableDate,
  oasisId: nullableText,
  teacherNationalCode: nullableText,
});

const PayloadSchema = z.array(ParsedStaffSchema).min(1).max(MAX_ROWS);

/**
 * Writes the previewed rows: a login and a staff record for each.
 *
 * Re-validates from scratch against the database rather than trusting the
 * payload — between preview and commit someone else may have taken one of
 * these email addresses, or renamed the department the file names.
 */
export async function commitStaffImport(
  _previous: StaffImportState,
  formData: FormData,
): Promise<StaffImportState> {
  const session = await requirePermission("staff.create");
  const payload = String(formData.get("payload") ?? "");

  let rows: z.infer<typeof PayloadSchema>;
  try {
    const decoded: unknown = JSON.parse(payload);
    const parsed = PayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      // Name the row. A blanket "could not be read" leaves the admin
      // re-uploading a file that will fail identically every time.
      const rowsIn = Array.isArray(decoded) ? (decoded as { row?: number }[]) : [];
      return {
        ok: false,
        message: "Some rows could not be imported. Nothing has been written.",
        issues: parsed.error.issues.slice(0, 50).map((issue) => ({
          row: rowsIn[Number(issue.path[0])]?.row ?? 0,
          column: String(issue.path[1] ?? "row"),
          message: issue.message,
        })),
      };
    }
    rows = parsed.data;
  } catch {
    return { ok: false, message: "That import could not be read. Upload the file again." };
  }

  const { db, roleIdsByKey, nextSequence, context } = await loadContext(
    session.schoolId,
    session.permissions,
  );

  // Anything claimed since the preview was taken — plus a second look for
  // duplicates inside the payload itself, which the preview rules out but a
  // hand-made POST does not.
  const clashes: ImportIssue[] = [];
  const emailsSeen = new Set<string>();
  const employeeIdsSeen = new Set<string>();
  for (const row of rows) {
    if (context.existingEmails.has(row.email) || emailsSeen.has(row.email)) {
      clashes.push({
        row: row.row,
        column: "Email",
        message: `${row.email} is already taken. Nothing has been imported.`,
      });
    }
    emailsSeen.add(row.email);

    const employeeId = row.employeeId?.toLowerCase();
    if (
      employeeId &&
      (context.existingEmployeeIds.has(employeeId) || employeeIdsSeen.has(employeeId))
    ) {
      clashes.push({
        row: row.row,
        column: "Employee ID",
        message: `${row.employeeId} is already taken. Nothing has been imported.`,
      });
    }
    if (employeeId) employeeIdsSeen.add(employeeId);
  }
  if (clashes.length > 0) {
    return {
      ok: false,
      message: "Some of those rows can no longer be created. Nothing has been imported.",
      issues: clashes,
    };
  }

  // Resolve what the rows name into ids, failing the whole file if any of them
  // has gone. Roles especially: a row whose role vanished must never fall back
  // to another one.
  const unresolved: ImportIssue[] = [];
  const resolved = rows.map((row) => {
    const roleId = roleIdsByKey.get(row.roleKey);
    if (!roleId) {
      unresolved.push({
        row: row.row,
        column: "Role",
        message: `The role “${row.roleKey}” no longer exists. Nothing has been imported.`,
      });
    }

    let departmentId: string | null = null;
    if (row.departmentName) {
      departmentId = context.departmentIdsByName.get(nameKey(row.departmentName)) ?? null;
      if (!departmentId) {
        unresolved.push({
          row: row.row,
          column: "Department",
          message: `The department “${row.departmentName}” no longer exists. Nothing has been imported.`,
        });
      }
    }

    let designationId: string | null = null;
    if (row.designationName) {
      designationId = context.designationIdsByName.get(nameKey(row.designationName)) ?? null;
      if (!designationId) {
        unresolved.push({
          row: row.row,
          column: "Designation",
          message: `The designation “${row.designationName}” no longer exists. Nothing has been imported.`,
        });
      }
    }

    // The empty fall-back is never written: a missing role is collected above
    // and the whole file is rejected before anything reaches the database.
    return { row, roleId: roleId ?? "", departmentId, designationId };
  });
  if (unresolved.length > 0) {
    return { ok: false, message: "The setup changed while you were reviewing.", issues: unresolved };
  }

  // Aligned with `rows`, and so with `resolved`, which is the same map.
  const employeeIds = assignEmployeeIds(
    rows,
    nextSequence,
    context.existingEmployeeIds,
  );

  const year = new Date().getFullYear();

  // Hashing happens BEFORE the transaction opens. bcrypt at cost 12 is hundreds
  // of milliseconds of CPU per account; doing it inside would hold a database
  // transaction open for a minute at a time while no query runs.
  const prepared = await Promise.all(
    resolved.map(async (entry, index) => {
      const employeeId = employeeIds[index];
      return {
        ...entry,
        employeeId,
        passwordHash: await hashPassword(`${employeeId}@${year}`),
      };
    }),
  );

  // One transaction: a half-imported file is worse than a rejected one, because
  // nobody can tell which half landed — and here the half that landed can sign
  // in. Timeout raised: each row is two inserts plus a role connect.
  try {
    await db.$transaction(
      async (tx) => {
        for (const entry of prepared) {
          const row = entry.row;

          const user = await tx.user.create({
            data: {
              schoolId: session.schoolId,
              email: row.email,
              firstName: row.firstName,
              lastName: row.lastName,
              phone: row.phone,
              passwordHash: entry.passwordHash,
              // The password is derived from the employee id and therefore
              // known to anyone holding the list, so it must be replaced at
              // first sign-in.
              mustChangePassword: true,
              status: "ACTIVE",
              roles: { connect: [{ id: entry.roleId }] },
            },
            select: { id: true },
          });

          await tx.staffMember.create({
            data: {
              schoolId: session.schoolId,
              userId: user.id,
              employeeId: entry.employeeId,
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              phone: row.phone,
              dateOfBirth: row.dateOfBirth,
              gender: row.gender,
              staffType: row.staffType,
              employmentStatus: "ACTIVE",
              joiningDate: row.joiningDate,
              departmentId: entry.departmentId,
              designationId: entry.designationId,
              qualification: row.qualification,
              experience: row.experience,
              specialisation: row.specialisation,
              addressLine1: row.addressLine1,
              city: row.city,
              state: row.state,
              postalCode: row.postalCode,
              panNumber: row.panNumber,
              aadhaarNumber: row.aadhaarNumber,
              bankName: row.bankName,
              bankAccountNo: row.bankAccountNo,
              bankIfsc: row.bankIfsc,
              pfNumber: row.pfNumber,
              esiNumber: row.esiNumber,
              fatherOrHusbandName: row.fatherOrHusbandName,
              maritalStatus: row.maritalStatus,
              policeVerificationStatus: row.policeVerificationStatus,
              policeVerificationDate: row.policeVerificationDate,
              policeVerificationRef: row.policeVerificationRef,
              drivingLicenceNo: row.drivingLicenceNo,
              drivingLicenceExpiry: row.drivingLicenceExpiry,
              oasisId: row.oasisId,
              teacherNationalCode: row.teacherNationalCode,
            },
            select: { id: true },
          });
        }
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The detail goes to the server log, not the browser: Prisma's text names
    // models, columns and the failing query, which is schema the caller has no
    // business reading.
    console.error("[staff.import] failed and rolled back", error);
    return {
      ok: false,
      message: message.includes("Unique constraint")
        ? "An employee ID or email in that file is already in use. Nothing was created."
        : "The import failed and every row was rolled back. Nothing was created.",
    };
  }

  // Which roles were handed out is the security-relevant fact about an import,
  // so it is what the audit trail records.
  const byRole: Record<string, number> = {};
  for (const row of rows) {
    byRole[row.roleKey] = (byRole[row.roleKey] ?? 0) + 1;
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "staff.import",
    entityType: "StaffMember",
    after: {
      created: rows.length,
      byRole,
      accounts: prepared.map((entry) => ({
        employeeId: entry.employeeId,
        email: entry.row.email,
        role: entry.row.roleKey,
      })),
    },
  });

  revalidatePath("/staff");

  return {
    ok: true,
    created: rows.length,
    message: `${rows.length} staff member${rows.length === 1 ? "" : "s"} imported, each with a sign-in.`,
    passwordRule: temporaryPasswordRule(year, prepared[0].employeeId),
    createdStaff: prepared.map((entry) => ({
      employeeId: entry.employeeId,
      name: [entry.row.firstName, entry.row.lastName].filter(Boolean).join(" "),
      email: entry.row.email,
      password: `${entry.employeeId}@${year}`,
    })),
  };
}
