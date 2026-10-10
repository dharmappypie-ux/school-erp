/**
 * Student bulk import: parsing and validation.
 *
 * Kept free of Prisma and of React so the rules can be read — and tested —
 * on their own. The server action supplies what only the database knows
 * (which admission numbers already exist, which class-sections are real) and
 * this decides what each row means.
 *
 * The boundary this file defends: an import is the one operation where a
 * careless mistake multiplies. A wrong column mapping does not create one bad
 * student, it creates four hundred, and the school finds out in March when the
 * board registration fails. So every row is validated before any row is
 * written, and a file with errors is never partially applied.
 */

/** One physical line of the file, already split into cells. */
export type RawRow = Record<string, string>;

export interface ImportIssue {
  /** 1-based row number as the person sees it in Excel (header is row 1). */
  row: number;
  column: string;
  message: string;
}

export interface ParsedStudent {
  row: number;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: Date | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  admissionDate: Date | null;
  rollNumber: string | null;
  /** Class level name exactly as the school writes it, e.g. "Class 4". */
  className: string | null;
  sectionName: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  bloodGroup: string | null;
  religion: string | null;
  category: string | null;
  caste: string | null;
  aadhaarNumber: string | null;
  apaarId: string | null;
  penNumber: string | null;
  house: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelation: string;
}

/**
 * Splits CSV text into rows of cells.
 *
 * Hand-rolled rather than pulled from npm because the alternative is a
 * spreadsheet library in a Cloudflare Worker bundle for a job that is one
 * state machine. Handles quoted fields, embedded commas, embedded newlines and
 * doubled quotes — which is the whole of RFC 4180 that Excel actually emits.
 */
export function parseCsv(text: string): string[][] {
  // Excel writes a UTF-8 BOM; left in place it becomes part of the first
  // header name and every lookup for that column silently misses.
  const input = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      // Swallowed; the \n that follows ends the row.
    } else {
      cell += char;
    }
  }

  // A file that does not end in a newline still has a last row.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

/**
 * Column aliases.
 *
 * Schools export from whatever they already use, so the header is never the
 * one we asked for. Matching is case- and punctuation-insensitive.
 */
const COLUMN_ALIASES: Record<keyof ParsedStudent | string, string[]> = {
  admissionNo: ["admissionno", "admission", "admno", "admissionnumber", "srno", "srnumber", "enrollmentno"],
  firstName: ["firstname", "first", "givenname", "studentname", "name", "fullname"],
  middleName: ["middlename", "middle"],
  lastName: ["lastname", "last", "surname"],
  dateOfBirth: ["dateofbirth", "dob", "birthdate", "birthday"],
  gender: ["gender", "sex"],
  admissionDate: ["admissiondate", "dateofadmission", "doa", "joiningdate"],
  rollNumber: ["rollnumber", "rollno", "roll"],
  className: ["class", "classname", "standard", "grade", "classlevel"],
  sectionName: ["section", "sectionname", "division"],
  phone: ["phone", "mobile", "contact", "phoneno", "mobileno", "studentmobile"],
  email: ["email", "emailid", "mail"],
  addressLine1: ["address", "addressline1", "currentaddress", "residentialaddress"],
  city: ["city", "town"],
  state: ["state"],
  postalCode: ["postalcode", "pincode", "pin", "zip", "zipcode"],
  bloodGroup: ["bloodgroup", "blood"],
  religion: ["religion"],
  category: ["category", "socialcategory"],
  caste: ["caste"],
  aadhaarNumber: ["aadhaar", "aadhaarnumber", "aadhar", "adharno", "aadharno", "uid"],
  apaarId: ["apaar", "apaarid"],
  penNumber: ["pen", "pennumber", "permanenteducationnumber"],
  house: ["house"],
  guardianName: ["guardianname", "fathername", "fathersname", "parentname", "guardian"],
  guardianPhone: ["guardianphone", "fathermobile", "fathersmobile", "parentmobile", "guardianmobile", "fathercontact"],
  guardianRelation: ["guardianrelation", "relation", "relationship"],
};

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Maps the file's headers onto our field names. Unknown columns are ignored. */
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

/**
 * Reads a date written the way a person writes it.
 *
 * Accepts ISO (2015-08-23) and the day-first forms common in India
 * (23/08/2015, 23-08-2015). Month-first is NOT guessed: 03/04/2015 is
 * genuinely ambiguous, and picking wrong puts a child in the wrong class.
 * Day-first is assumed because that is what Indian schools write.
 */
export function parseImportDate(value: string): Date | "invalid" | null {
  const text = value.trim();
  if (text === "") return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dayFirst = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
  if (dayFirst) {
    return buildDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  }

  return "invalid";
}

function buildDate(year: number, month: number, day: number): Date | "invalid" {
  if (month < 1 || month > 12 || day < 1 || day > 31) return "invalid";
  // UTC midnight, matching every other date-only value in this codebase.
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 February, which the constructor would roll into March.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "invalid";
  }
  return date;
}

function parseGender(value: string): "MALE" | "FEMALE" | "OTHER" | null | "invalid" {
  const text = value.trim().toLowerCase();
  if (text === "") return null;
  if (["m", "male", "boy"].includes(text)) return "MALE";
  if (["f", "female", "girl"].includes(text)) return "FEMALE";
  if (["o", "other", "transgender", "t"].includes(text)) return "OTHER";
  return "invalid";
}

const RELATIONS = ["FATHER", "MOTHER", "GRANDPARENT", "UNCLE", "LOCAL_GUARDIAN", "OTHER"];

function parseRelation(value: string): string {
  const text = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return RELATIONS.includes(text) ? text : "FATHER";
}

export interface ValidationContext {
  /** Admission numbers already on the roll. */
  existingAdmissionNos: Set<string>;
  /** "class 4|a" → section id, lower-cased, for the current academic year. */
  sectionsByKey: Map<string, string>;
  /** Whether a class-section column is required (false when no year is open). */
  requireClass: boolean;
}

export interface ImportPreview {
  rows: ParsedStudent[];
  issues: ImportIssue[];
  unmatchedColumns: string[];
  /** Fields we understood, for the "what we read" summary. */
  matchedFields: string[];
}

/**
 * Turns parsed cells into students, collecting every problem rather than
 * stopping at the first — a person fixing a spreadsheet wants the whole list,
 * not one error per upload.
 */
export function buildPreview(
  grid: string[][],
  context: ValidationContext,
): ImportPreview {
  const issues: ImportIssue[] = [];
  const rows: ParsedStudent[] = [];

  if (grid.length === 0) {
    return { rows, issues: [{ row: 1, column: "file", message: "The file is empty." }], unmatchedColumns: [], matchedFields: [] };
  }

  const [headers, ...body] = grid;
  const { mapping, unmatched } = mapHeaders(headers);

  if (mapping.admissionNo === undefined) {
    issues.push({ row: 1, column: "Admission no.", message: "No admission number column found. Add one — it is how a student is identified." });
  }
  if (mapping.firstName === undefined) {
    issues.push({ row: 1, column: "Name", message: "No name column found." });
  }
  if (issues.length > 0) {
    return { rows, issues, unmatchedColumns: unmatched, matchedFields: Object.keys(mapping) };
  }

  const cell = (line: string[], field: string): string => {
    const index = mapping[field];
    return index === undefined ? "" : (line[index] ?? "").trim();
  };

  const seenInFile = new Map<string, number>();

  body.forEach((line, bodyIndex) => {
    // +2: the header is row 1 and arrays are zero-based.
    const row = bodyIndex + 2;

    const admissionNo = cell(line, "admissionNo");
    if (admissionNo === "") {
      issues.push({ row, column: "Admission no.", message: "Required." });
      return;
    }
    if (context.existingAdmissionNos.has(admissionNo.toLowerCase())) {
      issues.push({ row, column: "Admission no.", message: `${admissionNo} is already on the roll.` });
      return;
    }
    const duplicateOf = seenInFile.get(admissionNo.toLowerCase());
    if (duplicateOf !== undefined) {
      issues.push({ row, column: "Admission no.", message: `${admissionNo} also appears on row ${duplicateOf}.` });
      return;
    }
    seenInFile.set(admissionNo.toLowerCase(), row);

    // A single "Name" column is common; split it so the roll sorts by surname.
    let firstName = cell(line, "firstName");
    let middleName = cell(line, "middleName");
    let lastName = cell(line, "lastName");
    if (firstName === "") {
      issues.push({ row, column: "Name", message: "Required." });
      return;
    }
    if (lastName === "" && middleName === "" && firstName.includes(" ")) {
      const parts = firstName.split(/\s+/);
      firstName = parts[0];
      lastName = parts.length > 1 ? parts[parts.length - 1] : "";
      middleName = parts.slice(1, -1).join(" ");
    }

    const dob = parseImportDate(cell(line, "dateOfBirth"));
    if (dob === "invalid") {
      issues.push({ row, column: "Date of birth", message: `Could not read “${cell(line, "dateOfBirth")}”. Use DD/MM/YYYY or YYYY-MM-DD.` });
    }

    const admissionDate = parseImportDate(cell(line, "admissionDate"));
    if (admissionDate === "invalid") {
      issues.push({ row, column: "Admission date", message: `Could not read “${cell(line, "admissionDate")}”. Use DD/MM/YYYY or YYYY-MM-DD.` });
    }

    const gender = parseGender(cell(line, "gender"));
    if (gender === "invalid") {
      issues.push({ row, column: "Gender", message: `Could not read “${cell(line, "gender")}”. Use Male, Female or Other.` });
    }

    const className = cell(line, "className");
    const sectionName = cell(line, "sectionName");
    if (className !== "" || sectionName !== "") {
      if (className === "" || sectionName === "") {
        issues.push({ row, column: "Class / Section", message: "Give both class and section, or neither." });
      } else {
        const key = `${className.toLowerCase()}|${sectionName.toLowerCase()}`;
        if (!context.sectionsByKey.has(key)) {
          issues.push({ row, column: "Class / Section", message: `No section “${className} ${sectionName}” in the current year.` });
        }
      }
    } else if (context.requireClass) {
      issues.push({ row, column: "Class / Section", message: "Required — the student needs a class to be enrolled in." });
    }

    const guardianName = cell(line, "guardianName");
    const guardianPhone = cell(line, "guardianPhone");
    if (guardianName !== "" && guardianPhone === "") {
      issues.push({ row, column: "Guardian phone", message: "A guardian needs a contact number." });
    }

    rows.push({
      row,
      admissionNo,
      firstName,
      middleName: middleName || null,
      lastName: lastName || null,
      dateOfBirth: dob === "invalid" ? null : dob,
      gender: gender === "invalid" ? null : gender,
      admissionDate: admissionDate === "invalid" ? null : admissionDate,
      rollNumber: cell(line, "rollNumber") || null,
      className: className || null,
      sectionName: sectionName || null,
      phone: cell(line, "phone") || null,
      email: cell(line, "email") || null,
      addressLine1: cell(line, "addressLine1") || null,
      city: cell(line, "city") || null,
      state: cell(line, "state") || null,
      postalCode: cell(line, "postalCode") || null,
      bloodGroup: cell(line, "bloodGroup") || null,
      religion: cell(line, "religion") || null,
      category: cell(line, "category") || null,
      caste: cell(line, "caste") || null,
      aadhaarNumber: cell(line, "aadhaarNumber") || null,
      apaarId: cell(line, "apaarId") || null,
      penNumber: cell(line, "penNumber") || null,
      house: cell(line, "house") || null,
      guardianName: guardianName || null,
      guardianPhone: guardianPhone || null,
      guardianRelation: parseRelation(cell(line, "guardianRelation")),
    });
  });

  return {
    rows,
    issues,
    unmatchedColumns: unmatched,
    matchedFields: Object.keys(mapping),
  };
}

/** The columns the template offers, in the order they appear in it. */
export const TEMPLATE_COLUMNS = [
  "Admission No",
  "First Name",
  "Middle Name",
  "Last Name",
  "Date of Birth",
  "Gender",
  "Class",
  "Section",
  "Roll No",
  "Admission Date",
  "Father Name",
  "Father Mobile",
  "Relation",
  "Phone",
  "Email",
  "Address",
  "City",
  "State",
  "Pin Code",
  "Blood Group",
  "Religion",
  "Category",
  "Caste",
  "Aadhaar",
  "APAAR ID",
  "PEN",
  "House",
];

export function buildTemplateCsv(): string {
  const example = [
    "GIS2027001",
    "Aarav",
    "",
    "Sharma",
    "23/08/2015",
    "Male",
    "Class 4",
    "A",
    "1",
    "01/04/2027",
    "Rajesh Sharma",
    "9876543210",
    "Father",
    "",
    "",
    "12 MG Road",
    "Dehradun",
    "Uttarakhand",
    "248001",
    "B+",
    "Hindu",
    "General",
    "",
    "",
    "",
    "",
    "Tagore",
  ];
  return `${TEMPLATE_COLUMNS.join(",")}\n${example.join(",")}\n`;
}
