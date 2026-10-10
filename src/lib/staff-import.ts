/**
 * Staff bulk import: parsing and validation.
 *
 * The sibling of `student-import.ts`, and deliberately shaped like it: free of
 * Prisma and of React so the rules can be read — and tested — on their own. The
 * server action supplies what only the database knows (which emails are taken,
 * which departments exist, which roles the school has) and this decides what
 * each row means.
 *
 * What makes staff different from students, and why this file is stricter:
 * every row creates a *login*. A wrong class on a student row is embarrassing;
 * a wrong role on a staff row hands somebody the fee ledger. So the role is
 * resolved against the school's own role table and never guessed, and a
 * department or designation that does not exist is an error rather than a new
 * department — which departments a school has is a decision somebody makes
 * deliberately, not a side effect of a typo in a spreadsheet.
 */

import {
  parseCsv,
  parseImportDate,
  type ImportIssue,
} from "@/lib/student-import";

/**
 * The CSV state machine, the date convention and the issue shape are the
 * student import's, reused unchanged. Two spreadsheet readers that disagree
 * about what 03/04/2015 means — or that report problems in two different
 * shapes, needing two different tables to render them — is a bug and a second
 * UI, for no gain. Re-exported so the staff action has one import.
 */
export { parseCsv, type ImportIssue };

/**
 * The enums this import writes into, spelled exactly as prisma/schema.prisma
 * spells them. Kept as literal tuples so the type and the list shown to the
 * user cannot drift apart, and so the action's zod schema can take them
 * directly.
 */
export const STAFF_TYPE_VALUES = [
  "TEACHING",
  "NON_TEACHING",
  "ADMINISTRATIVE",
  "SUPPORT",
  "MANAGEMENT",
] as const;

export const MARITAL_STATUS_VALUES = [
  "MARRIED",
  "UNMARRIED",
  "WIDOWED",
  "DIVORCED",
] as const;

export const POLICE_VERIFICATION_VALUES = [
  "NOT_STARTED",
  "SUBMITTED",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
] as const;

export type StaffTypeValue = (typeof STAFF_TYPE_VALUES)[number];
export type MaritalStatusValue = (typeof MARITAL_STATUS_VALUES)[number];
export type PoliceVerificationValue = (typeof POLICE_VERIFICATION_VALUES)[number];

export interface ParsedStaff {
  row: number;
  /** Null when the file left it blank — the commit generates one in sequence. */
  employeeId: string | null;
  firstName: string;
  lastName: string | null;
  /** Lower-cased: this is the login, and logins are not case-sensitive here. */
  email: string;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  staffType: StaffTypeValue;
  /** Canonical role key, resolved from either a key or the role's own name. */
  roleKey: string;
  /** Names exactly as written; the commit re-resolves them to ids. */
  departmentName: string | null;
  designationName: string | null;
  joiningDate: Date | null;
  qualification: string | null;
  experience: number | null;
  specialisation: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankIfsc: string | null;
  /** EPFO Universal Account Number — the schema calls this column pfNumber. */
  pfNumber: string | null;
  esiNumber: string | null;
  fatherOrHusbandName: string | null;
  maritalStatus: MaritalStatusValue | null;
  policeVerificationStatus: PoliceVerificationValue;
  policeVerificationDate: Date | null;
  policeVerificationRef: string | null;
  drivingLicenceNo: string | null;
  drivingLicenceExpiry: Date | null;
  oasisId: string | null;
  teacherNationalCode: string | null;
}

/**
 * Column aliases.
 *
 * Schools export from whatever HR sheet they already keep, so the header is
 * never the one we asked for. Matching is case- and punctuation-insensitive.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  employeeId: ["employeeid", "empid", "empno", "employeeno", "employeecode", "staffid", "staffcode"],
  firstName: ["firstname", "first", "givenname", "name", "fullname", "staffname", "employeename", "teachername"],
  lastName: ["lastname", "last", "surname"],
  email: ["email", "emailid", "mail", "emailaddress", "officialemail", "loginemail"],
  phone: ["phone", "mobile", "contact", "phoneno", "mobileno", "contactno", "cellno"],
  dateOfBirth: ["dateofbirth", "dob", "birthdate", "birthday"],
  gender: ["gender", "sex"],
  staffType: ["stafftype", "type", "employeetype", "staffcategory", "employmenttype"],
  roleKey: ["role", "rolekey", "systemrole", "userrole", "accessrole", "portalrole"],
  departmentName: ["department", "departmentname", "dept"],
  designationName: ["designation", "designationname", "post", "jobtitle", "title"],
  joiningDate: ["joiningdate", "dateofjoining", "doj", "joined", "appointmentdate"],
  qualification: ["qualification", "qualifications", "education", "highestqualification"],
  experience: ["experience", "experienceyears", "yearsofexperience", "totalexperience", "exp"],
  specialisation: ["specialisation", "specialization", "expertise", "subjectspecialisation", "subjectspecialization"],
  addressLine1: ["address", "addressline1", "currentaddress", "residentialaddress"],
  city: ["city", "town"],
  state: ["state"],
  postalCode: ["postalcode", "pincode", "pin", "zip", "zipcode"],
  panNumber: ["pan", "panno", "pannumber", "pancardno"],
  aadhaarNumber: ["aadhaar", "aadhaarnumber", "aadhar", "adharno", "aadharno", "uid"],
  bankName: ["bankname", "bank"],
  bankAccountNo: ["bankaccount", "bankaccountno", "accountno", "accountnumber", "bankacno"],
  bankIfsc: ["ifsc", "ifsccode", "bankifsc"],
  pfNumber: ["uan", "uanno", "uannumber", "pf", "pfno", "pfnumber", "epfuan"],
  esiNumber: ["esi", "esino", "esinumber", "esic", "esicnumber"],
  fatherOrHusbandName: ["fathername", "fathersname", "husbandname", "fatherhusbandname", "fatherorhusbandname", "spousename"],
  maritalStatus: ["maritalstatus", "marital"],
  policeVerificationStatus: ["policeverificationstatus", "policeverification", "policecheck", "pvstatus"],
  policeVerificationDate: ["policeverificationdate", "policeverifiedon", "pvdate"],
  policeVerificationRef: ["policeverificationref", "policeverificationreference", "policereferenceno", "pvref"],
  drivingLicenceNo: ["drivinglicence", "drivinglicense", "drivinglicenceno", "drivinglicenseno", "licenceno", "licenseno", "dl", "dlno"],
  drivingLicenceExpiry: ["licenceexpiry", "licenseexpiry", "drivinglicenceexpiry", "drivinglicenseexpiry", "dlexpiry", "licencevalidtill"],
  oasisId: ["oasisid", "oasis", "oasiscode", "cbseoasisid"],
  teacherNationalCode: ["teachernationalcode", "nationalteachercode", "ncteid", "teachercode", "tnc"],
};

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The key a role is looked up by.
 *
 * Punctuation and spacing are stripped so "TRANSPORT_MANAGER", "Transport
 * Manager" and "transport manager" all land on the same role. The action builds
 * its lookup map with this same function — exported precisely so the two cannot
 * drift apart and leave a role that validates but then cannot be found.
 */
export function roleLabelKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The key a department or designation is matched by: name, case-insensitively. */
export function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Maps the file's headers onto our field names. Unknown columns are reported. */
export function mapHeaders(headers: string[]): {
  mapping: Record<string, number>;
  unmatched: string[];
} {
  const mapping: Record<string, number> = {};
  const unmatched: string[] = [];

  headers.forEach((header, index) => {
    const key = normaliseHeader(header);
    if (key === "") return;
    const field = Object.keys(COLUMN_ALIASES).find(
      (candidate) =>
        normaliseHeader(candidate) === key ||
        COLUMN_ALIASES[candidate].includes(key),
    );
    // First header wins: a file with both "Name" and "First Name" should not
    // have the second quietly overwrite the first.
    if (field && mapping[field] === undefined) {
      mapping[field] = index;
    } else if (!field) {
      unmatched.push(header);
    }
  });

  return { mapping, unmatched };
}

// A deliberately loose check: the point is to catch "rajesh.sharma" and
// "rajesh@school" before they become a login nobody can sign in with, not to
// adjudicate RFC 5322.
/**
 * Exported so the commit validates with exactly this, not a stricter rule of
 * its own. When the two disagreed, an address the preview accepted failed the
 * commit with no row number — and re-uploading the same file reproduced it
 * forever. Deliberately loose: school mail often lives on an on-premise host
 * whose address a stricter validator rejects.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseGender(value: string): "MALE" | "FEMALE" | "OTHER" | null | "invalid" {
  const text = value.trim().toLowerCase();
  if (text === "") return null;
  if (["m", "male", "boy", "man"].includes(text)) return "MALE";
  if (["f", "female", "girl", "woman"].includes(text)) return "FEMALE";
  if (["o", "other", "transgender", "t"].includes(text)) return "OTHER";
  return "invalid";
}

/**
 * Staff type.
 *
 * "Admin", "Teacher" and "Non Teaching" are what HR sheets actually say, so
 * they are accepted as aliases of the enum values. Anything else is an error
 * rather than a silent fall-back to TEACHING: a support worker filed as
 * teaching staff turns up in the wrong statutory return.
 */
function parseStaffType(value: string): StaffTypeValue | null | "invalid" {
  const text = normaliseHeader(value);
  if (text === "") return null;
  if (["teaching", "teacher", "academic", "faculty"].includes(text)) return "TEACHING";
  if (["nonteaching", "nonteacher", "nonacademic"].includes(text)) return "NON_TEACHING";
  if (["administrative", "admin", "administration", "office"].includes(text)) {
    return "ADMINISTRATIVE";
  }
  if (["support", "supportstaff", "helper", "ancillary"].includes(text)) return "SUPPORT";
  if (["management", "manager", "leadership"].includes(text)) return "MANAGEMENT";
  return "invalid";
}

function parseMaritalStatus(value: string): MaritalStatusValue | null | "invalid" {
  const text = normaliseHeader(value);
  if (text === "") return null;
  if (["married", "wed"].includes(text)) return "MARRIED";
  if (["unmarried", "single", "notmarried"].includes(text)) return "UNMARRIED";
  if (["widowed", "widow", "widower"].includes(text)) return "WIDOWED";
  if (["divorced", "divorcee"].includes(text)) return "DIVORCED";
  return "invalid";
}

/**
 * Police verification status.
 *
 * Only the five recorded states are accepted — "pending" is refused on purpose
 * because it could mean "not sent yet" or "sent, awaiting the police", and this
 * is the column an inspector reads.
 */
function parsePoliceVerification(
  value: string,
): PoliceVerificationValue | null | "invalid" {
  const text = normaliseHeader(value);
  if (text === "") return null;
  if (["notstarted", "none", "no", "na", "notdone"].includes(text)) return "NOT_STARTED";
  if (["submitted", "applied", "sent"].includes(text)) return "SUBMITTED";
  if (["verified", "clear", "cleared", "done", "complete", "completed"].includes(text)) {
    return "VERIFIED";
  }
  if (["rejected", "failed", "adverse"].includes(text)) return "REJECTED";
  if (["expired", "lapsed"].includes(text)) return "EXPIRED";
  return "invalid";
}

/**
 * Years of experience.
 *
 * Stored as a whole number, so "8.5 years" is rounded rather than rejected —
 * refusing a file over half a year of experience helps nobody.
 */
function parseExperience(value: string): number | null | "invalid" {
  const text = value.trim().toLowerCase().replace(/\s*(years|year|yrs|yr)\.?$/, "").trim();
  if (text === "") return null;
  const years = Number(text);
  if (!Number.isFinite(years) || years < 0 || years > 70) return "invalid";
  return Math.round(years);
}

export interface StaffValidationContext {
  /** Lower-cased emails of every user in the school — not just staff. */
  existingEmails: Set<string>;
  /** Lower-cased employee ids already issued in this school. */
  existingEmployeeIds: Set<string>;
  /** roleLabelKey(key or name) → the canonical role key. */
  roleKeysByLabel: Map<string, string>;
  /** Role names as the school's own role table spells them, for error messages. */
  roleLabels: string[];
  /** nameKey(name) → department id. */
  departmentIdsByName: Map<string, string>;
  departmentNames: string[];
  /** nameKey(name) → designation id. */
  designationIdsByName: Map<string, string>;
  designationNames: string[];
}

export interface StaffImportPreview {
  rows: ParsedStaff[];
  issues: ImportIssue[];
  unmatchedColumns: string[];
  /** Fields we understood, for the "what we read" summary. */
  matchedFields: string[];
}

/** "Accounts, Science" — or a nudge when the school has none of them yet. */
function listOrNudge(names: string[], nudge: string): string {
  return names.length > 0 ? names.join(", ") : nudge;
}

const NO_ROLES = "none have been set up in this school yet";
const NO_DEPARTMENTS =
  "none have been set up yet — add them under Settings, or leave the column blank";
const NO_DESIGNATIONS =
  "none have been set up yet — add them under Settings, or leave the column blank";

/**
 * Turns parsed cells into staff members, collecting every problem rather than
 * stopping at the first — a person fixing a spreadsheet wants the whole list,
 * not one error per upload.
 */
export function buildStaffPreview(
  grid: string[][],
  context: StaffValidationContext,
): StaffImportPreview {
  const issues: ImportIssue[] = [];
  const rows: ParsedStaff[] = [];

  if (grid.length === 0) {
    return {
      rows,
      issues: [{ row: 1, column: "file", message: "The file is empty." }],
      unmatchedColumns: [],
      matchedFields: [],
    };
  }

  const [headers, ...body] = grid;
  const { mapping, unmatched } = mapHeaders(headers);

  if (mapping.firstName === undefined) {
    issues.push({ row: 1, column: "Name", message: "No name column found." });
  }
  if (mapping.email === undefined) {
    issues.push({
      row: 1,
      column: "Email",
      message: "No email column found. Add one — it is the address each person signs in with.",
    });
  }
  // Role is checked at the header too, so a file without the column reports one
  // problem instead of the same problem four hundred times.
  if (mapping.roleKey === undefined) {
    issues.push({
      row: 1,
      column: "Role",
      message: `No role column found. Add one — the role decides what each person can open. Valid roles: ${listOrNudge(context.roleLabels, NO_ROLES)}.`,
    });
  }
  if (issues.length > 0) {
    return { rows, issues, unmatchedColumns: unmatched, matchedFields: Object.keys(mapping) };
  }

  const cell = (line: string[], field: string): string => {
    const index = mapping[field];
    return index === undefined ? "" : (line[index] ?? "").trim();
  };

  const emailsSeen = new Map<string, number>();
  const employeeIdsSeen = new Map<string, number>();

  body.forEach((line, bodyIndex) => {
    // +2: the header is row 1 and arrays are zero-based.
    const row = bodyIndex + 2;

    const email = cell(line, "email").toLowerCase();
    if (email === "") {
      issues.push({ row, column: "Email", message: "Required — it is the sign-in address." });
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      issues.push({ row, column: "Email", message: `“${email}” is not an email address.` });
      return;
    }
    // Checked against every user in the school, not just staff: a parent or a
    // student already holding this address owns the login, and the database
    // would reject the row anyway — after the other rows had been written.
    if (context.existingEmails.has(email)) {
      issues.push({ row, column: "Email", message: `${email} already has a login in this school.` });
      return;
    }
    const emailDuplicateOf = emailsSeen.get(email);
    if (emailDuplicateOf !== undefined) {
      issues.push({ row, column: "Email", message: `${email} also appears on row ${emailDuplicateOf}.` });
      return;
    }
    emailsSeen.set(email, row);

    // A single "Name" column is common; split it so the staff list sorts by
    // surname. Staff have no middle name column, so everything after the first
    // word is the surname.
    let firstName = cell(line, "firstName");
    let lastName = cell(line, "lastName");
    if (firstName === "") {
      issues.push({ row, column: "Name", message: "Required." });
      return;
    }
    if (lastName === "" && firstName.includes(" ")) {
      const parts = firstName.split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }

    // The role is never defaulted. Guessing wrong hands somebody access they
    // should not have, and nobody would notice until they used it.
    const roleText = cell(line, "roleKey");
    let roleKey: string | null = null;
    if (roleText === "") {
      issues.push({
        row,
        column: "Role",
        message: `Required. Valid roles: ${listOrNudge(context.roleLabels, NO_ROLES)}.`,
      });
    } else {
      roleKey = context.roleKeysByLabel.get(roleLabelKey(roleText)) ?? null;
      if (!roleKey) {
        issues.push({
          row,
          column: "Role",
          message: `No role “${roleText}” in this school. Valid roles: ${listOrNudge(context.roleLabels, NO_ROLES)}.`,
        });
      }
    }

    const employeeId = cell(line, "employeeId");
    if (employeeId !== "") {
      if (context.existingEmployeeIds.has(employeeId.toLowerCase())) {
        issues.push({ row, column: "Employee ID", message: `${employeeId} is already in use.` });
      } else {
        const idDuplicateOf = employeeIdsSeen.get(employeeId.toLowerCase());
        if (idDuplicateOf !== undefined) {
          issues.push({ row, column: "Employee ID", message: `${employeeId} also appears on row ${idDuplicateOf}.` });
        } else {
          employeeIdsSeen.set(employeeId.toLowerCase(), row);
        }
      }
    }

    // Departments and designations arrive as names and are matched against what
    // the school already has. An unknown one is an error, never a new
    // department: the org chart is not edited by spreadsheet.
    const departmentName = cell(line, "departmentName");
    if (departmentName !== "" && !context.departmentIdsByName.has(nameKey(departmentName))) {
      issues.push({
        row,
        column: "Department",
        message: `No department “${departmentName}”. Valid departments: ${listOrNudge(context.departmentNames, NO_DEPARTMENTS)}.`,
      });
    }

    const designationName = cell(line, "designationName");
    if (designationName !== "" && !context.designationIdsByName.has(nameKey(designationName))) {
      issues.push({
        row,
        column: "Designation",
        message: `No designation “${designationName}”. Valid designations: ${listOrNudge(context.designationNames, NO_DESIGNATIONS)}.`,
      });
    }

    const dateOfBirth = parseImportDate(cell(line, "dateOfBirth"));
    if (dateOfBirth === "invalid") {
      issues.push({ row, column: "Date of birth", message: `Could not read “${cell(line, "dateOfBirth")}”. Use DD/MM/YYYY or YYYY-MM-DD.` });
    }

    const joiningDate = parseImportDate(cell(line, "joiningDate"));
    if (joiningDate === "invalid") {
      issues.push({ row, column: "Joining date", message: `Could not read “${cell(line, "joiningDate")}”. Use DD/MM/YYYY or YYYY-MM-DD.` });
    }

    const policeVerificationDate = parseImportDate(cell(line, "policeVerificationDate"));
    if (policeVerificationDate === "invalid") {
      issues.push({ row, column: "Police verification date", message: `Could not read “${cell(line, "policeVerificationDate")}”. Use DD/MM/YYYY or YYYY-MM-DD.` });
    }

    const drivingLicenceExpiry = parseImportDate(cell(line, "drivingLicenceExpiry"));
    if (drivingLicenceExpiry === "invalid") {
      issues.push({ row, column: "Licence expiry", message: `Could not read “${cell(line, "drivingLicenceExpiry")}”. Use DD/MM/YYYY or YYYY-MM-DD.` });
    }

    const gender = parseGender(cell(line, "gender"));
    if (gender === "invalid") {
      issues.push({ row, column: "Gender", message: `Could not read “${cell(line, "gender")}”. Use Male, Female or Other.` });
    }

    const staffType = parseStaffType(cell(line, "staffType"));
    if (staffType === "invalid") {
      issues.push({
        row,
        column: "Staff type",
        message: `Could not read “${cell(line, "staffType")}”. Use ${STAFF_TYPE_VALUES.join(", ")}.`,
      });
    }

    const maritalStatus = parseMaritalStatus(cell(line, "maritalStatus"));
    if (maritalStatus === "invalid") {
      issues.push({
        row,
        column: "Marital status",
        message: `Could not read “${cell(line, "maritalStatus")}”. Use ${MARITAL_STATUS_VALUES.join(", ")}.`,
      });
    }

    const policeVerificationStatus = parsePoliceVerification(
      cell(line, "policeVerificationStatus"),
    );
    if (policeVerificationStatus === "invalid") {
      issues.push({
        row,
        column: "Police verification status",
        message: `Could not read “${cell(line, "policeVerificationStatus")}”. Use ${POLICE_VERIFICATION_VALUES.join(", ")}.`,
      });
    }

    const experience = parseExperience(cell(line, "experience"));
    if (experience === "invalid") {
      issues.push({ row, column: "Experience", message: `Could not read “${cell(line, "experience")}”. Give a number of years, such as 8.` });
    }

    // A row that could not be given a role is not a staff member we can create,
    // so it is left out of the preview entirely — but the problems found above
    // are still reported, so one upload shows everything that needs fixing.
    if (!roleKey) return;

    rows.push({
      row,
      employeeId: employeeId || null,
      firstName,
      lastName: lastName || null,
      email,
      phone: cell(line, "phone") || null,
      dateOfBirth: dateOfBirth === "invalid" ? null : dateOfBirth,
      gender: gender === "invalid" ? null : gender,
      // The schema's own default; a blank column should not fail a file.
      staffType: staffType === "invalid" || staffType === null ? "TEACHING" : staffType,
      roleKey,
      departmentName: departmentName || null,
      designationName: designationName || null,
      joiningDate: joiningDate === "invalid" ? null : joiningDate,
      qualification: cell(line, "qualification") || null,
      experience: experience === "invalid" ? null : experience,
      specialisation: cell(line, "specialisation") || null,
      addressLine1: cell(line, "addressLine1") || null,
      city: cell(line, "city") || null,
      state: cell(line, "state") || null,
      postalCode: cell(line, "postalCode") || null,
      panNumber: cell(line, "panNumber") || null,
      aadhaarNumber: cell(line, "aadhaarNumber") || null,
      bankName: cell(line, "bankName") || null,
      bankAccountNo: cell(line, "bankAccountNo") || null,
      bankIfsc: cell(line, "bankIfsc") || null,
      pfNumber: cell(line, "pfNumber") || null,
      esiNumber: cell(line, "esiNumber") || null,
      fatherOrHusbandName: cell(line, "fatherOrHusbandName") || null,
      maritalStatus: maritalStatus === "invalid" ? null : maritalStatus,
      policeVerificationStatus:
        policeVerificationStatus === "invalid" || policeVerificationStatus === null
          ? "NOT_STARTED"
          : policeVerificationStatus,
      policeVerificationDate:
        policeVerificationDate === "invalid" ? null : policeVerificationDate,
      policeVerificationRef: cell(line, "policeVerificationRef") || null,
      drivingLicenceNo: cell(line, "drivingLicenceNo") || null,
      drivingLicenceExpiry:
        drivingLicenceExpiry === "invalid" ? null : drivingLicenceExpiry,
      oasisId: cell(line, "oasisId") || null,
      teacherNationalCode: cell(line, "teacherNationalCode") || null,
    });
  });

  return {
    rows,
    issues,
    unmatchedColumns: unmatched,
    matchedFields: Object.keys(mapping),
  };
}

/**
 * How the people in this file will sign in.
 *
 * Written once and shown twice — on the preview and again when the import
 * finishes — because this is the sentence the whole feature turns on. Importing
 * forty staff creates forty accounts, and without this nobody knows the
 * passwords, so forty people cannot get in and the import was pointless.
 */
export function temporaryPasswordRule(year: number, exampleEmployeeId: string): string {
  return `Everyone signs in with their own email address. The temporary password is their employee ID and @${year} — for example ${exampleEmployeeId}@${year} — and they must change it on first sign-in.`;
}

/** Builds the next employee id in sequence, matching the one-at-a-time form. */
export function formatEmployeeId(sequence: number): string {
  return `EMP${String(sequence).padStart(4, "0")}`;
}

/** The columns the template offers, in the order they appear in it. */
export const TEMPLATE_COLUMNS = [
  "Employee ID",
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Date of Birth",
  "Gender",
  "Staff Type",
  "Role",
  "Department",
  "Designation",
  "Joining Date",
  "Qualification",
  "Experience",
  "Specialisation",
  "Address",
  "City",
  "State",
  "Pin Code",
  "PAN",
  "Aadhaar",
  "Bank Name",
  "Bank Account",
  "IFSC",
  "UAN",
  "ESI",
  "Father/Husband Name",
  "Marital Status",
  "Police Verification Status",
  "Police Verification Date",
  "Police Verification Ref",
  "Driving Licence",
  "Licence Expiry",
  "OASIS ID",
  "Teacher National Code",
];

export function buildTemplateCsv(): string {
  // No value here contains a comma, so the row needs no quoting — keep it that
  // way if you edit it.
  const example = [
    "",
    "Meera",
    "Nair",
    "meera.nair@school.edu.in",
    "9876543210",
    "14/06/1988",
    "Female",
    "Teaching",
    "TEACHER",
    "Science",
    "Senior Teacher",
    "01/04/2024",
    "M.Sc B.Ed",
    "8",
    "Physics",
    "22 Rajpur Road",
    "Dehradun",
    "Uttarakhand",
    "248001",
    "ABCDE1234F",
    "",
    "State Bank of India",
    "30123456789",
    "SBIN0001234",
    "",
    "",
    "Suresh Nair",
    "Married",
    "Verified",
    "12/03/2024",
    "PV/2024/1182",
    "",
    "",
    "",
    "",
  ];
  return `${TEMPLATE_COLUMNS.join(",")}\n${example.join(",")}\n`;
}
