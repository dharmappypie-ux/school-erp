/**
 * Report builder — a declarative query spec that compiles to Prisma.
 *
 * The security position is the whole point: a report definition is
 * user-supplied and may be saved, shared and re-run later, so it is never
 * allowed to express anything but a choice from fixed lists. Sources, fields
 * and operators are whitelisted; a definition naming anything outside them is
 * rejected rather than passed through. No string SQL is ever assembled, so
 * there is nothing for a value to break out of — filter values reach Prisma as
 * parameters and are only ever data.
 *
 * Tenant scoping is not expressed here at all. Running a report goes through
 * `scopedDb`, which injects `schoolId` below this layer, so a definition
 * cannot reach another school even if it tries.
 */

export type FieldType = "string" | "number" | "date" | "enum" | "boolean";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  /** Prisma path from the source model, e.g. ["section", "classLevel", "name"]. */
  path: string[];
  /** Allowed values for an enum field. */
  options?: readonly string[];
}

export interface SourceSpec {
  key: string;
  label: string;
  description: string;
  /** Permission a user must hold to run reports against this source. */
  permission: string;
  /** Prisma delegate name on the scoped client. */
  model: string;
  fields: readonly FieldSpec[];
  /** Applied to every query on this source, e.g. excluding soft-deleted rows. */
  baseWhere?: Record<string, unknown>;
}

const STUDENT_FIELDS: FieldSpec[] = [
  { key: "admissionNo", label: "Admission no.", type: "string", path: ["admissionNo"] },
  { key: "firstName", label: "First name", type: "string", path: ["firstName"] },
  { key: "lastName", label: "Last name", type: "string", path: ["lastName"] },
  { key: "gender", label: "Gender", type: "enum", path: ["gender"], options: ["MALE", "FEMALE", "OTHER"] },
  {
    key: "status", label: "Status", type: "enum", path: ["status"],
    options: ["ACTIVE", "ALUMNI", "TRANSFERRED", "DROPPED", "SUSPENDED", "ON_LEAVE"],
  },
  { key: "category", label: "Category", type: "string", path: ["category"] },
  { key: "bloodGroup", label: "Blood group", type: "string", path: ["bloodGroup"] },
  { key: "dateOfBirth", label: "Date of birth", type: "date", path: ["dateOfBirth"] },
  { key: "admissionDate", label: "Admitted on", type: "date", path: ["admissionDate"] },
  { key: "city", label: "City", type: "string", path: ["city"] },
  { key: "phone", label: "Phone", type: "string", path: ["phone"] },
  { key: "email", label: "Email", type: "string", path: ["email"] },
];

const STAFF_FIELDS: FieldSpec[] = [
  { key: "employeeId", label: "Employee ID", type: "string", path: ["employeeId"] },
  { key: "firstName", label: "First name", type: "string", path: ["firstName"] },
  { key: "lastName", label: "Last name", type: "string", path: ["lastName"] },
  { key: "gender", label: "Gender", type: "enum", path: ["gender"], options: ["MALE", "FEMALE", "OTHER"] },
  {
    key: "staffType", label: "Staff type", type: "enum", path: ["staffType"],
    options: ["TEACHING", "NON_TEACHING", "ADMINISTRATIVE", "SUPPORT", "MANAGEMENT"],
  },
  {
    key: "employmentStatus", label: "Employment status", type: "enum", path: ["employmentStatus"],
    options: ["ACTIVE", "PROBATION", "ON_LEAVE", "RESIGNED", "TERMINATED", "RETIRED"],
  },
  { key: "department", label: "Department", type: "string", path: ["department", "name"] },
  { key: "designation", label: "Designation", type: "string", path: ["designation", "name"] },
  { key: "joiningDate", label: "Joined on", type: "date", path: ["joiningDate"] },
  { key: "qualification", label: "Qualification", type: "string", path: ["qualification"] },
  { key: "experience", label: "Experience (years)", type: "number", path: ["experience"] },
  { key: "phone", label: "Phone", type: "string", path: ["phone"] },
];

const INVOICE_FIELDS: FieldSpec[] = [
  { key: "invoiceNo", label: "Invoice no.", type: "string", path: ["invoiceNo"] },
  { key: "studentName", label: "Student", type: "string", path: ["student", "firstName"] },
  { key: "admissionNo", label: "Admission no.", type: "string", path: ["student", "admissionNo"] },
  { key: "period", label: "Period", type: "string", path: ["period"] },
  {
    key: "status", label: "Status", type: "enum", path: ["status"],
    options: ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED", "REFUNDED", "WRITTEN_OFF"],
  },
  { key: "total", label: "Total", type: "number", path: ["total"] },
  { key: "amountPaid", label: "Paid", type: "number", path: ["amountPaid"] },
  { key: "amountDue", label: "Balance", type: "number", path: ["amountDue"] },
  { key: "issueDate", label: "Issued on", type: "date", path: ["issueDate"] },
  { key: "dueDate", label: "Due on", type: "date", path: ["dueDate"] },
];

const PAYMENT_FIELDS: FieldSpec[] = [
  { key: "receiptNo", label: "Receipt no.", type: "string", path: ["receiptNo"] },
  { key: "studentName", label: "Student", type: "string", path: ["student", "firstName"] },
  { key: "admissionNo", label: "Admission no.", type: "string", path: ["student", "admissionNo"] },
  { key: "amount", label: "Amount", type: "number", path: ["amount"] },
  {
    key: "mode", label: "Mode", type: "enum", path: ["mode"],
    options: ["CASH", "CHEQUE", "DEMAND_DRAFT", "UPI", "CARD", "NETBANKING", "WALLET", "BANK_TRANSFER", "ADJUSTMENT"],
  },
  {
    key: "status", label: "Status", type: "enum", path: ["status"],
    options: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "REFUNDED", "CANCELLED", "BOUNCED"],
  },
  { key: "paidAt", label: "Received on", type: "date", path: ["paidAt"] },
  { key: "transactionRef", label: "Reference", type: "string", path: ["transactionRef"] },
];

const ATTENDANCE_FIELDS: FieldSpec[] = [
  { key: "studentName", label: "Student", type: "string", path: ["student", "firstName"] },
  { key: "admissionNo", label: "Admission no.", type: "string", path: ["student", "admissionNo"] },
  { key: "className", label: "Class", type: "string", path: ["section", "classLevel", "name"] },
  { key: "sectionName", label: "Section", type: "string", path: ["section", "name"] },
  { key: "date", label: "Date", type: "date", path: ["date"] },
  {
    key: "status", label: "Status", type: "enum", path: ["status"],
    options: ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "EXCUSED", "ON_LEAVE", "HOLIDAY"],
  },
  {
    key: "source", label: "Source", type: "enum", path: ["source"],
    options: ["MANUAL", "BIOMETRIC", "RFID", "MOBILE_APP", "IMPORT", "SELF_SERVICE"],
  },
];

export const SOURCES: readonly SourceSpec[] = [
  {
    key: "students",
    label: "Students",
    description: "Enrolled and former students",
    permission: "students.read",
    model: "student",
    fields: STUDENT_FIELDS,
    baseWhere: { deletedAt: null },
  },
  {
    key: "staff",
    label: "Staff",
    description: "Teaching and non-teaching staff",
    permission: "staff.read",
    model: "staffMember",
    fields: STAFF_FIELDS,
    baseWhere: { deletedAt: null },
  },
  {
    key: "invoices",
    label: "Invoices",
    description: "Fee demands and balances",
    permission: "fees.read",
    model: "invoice",
    fields: INVOICE_FIELDS,
  },
  {
    key: "payments",
    label: "Payments",
    description: "Receipts issued",
    permission: "fees.read",
    model: "payment",
    fields: PAYMENT_FIELDS,
  },
  {
    key: "attendance",
    label: "Attendance",
    description: "Daily attendance records",
    permission: "attendance.read",
    model: "attendanceRecord",
    fields: ATTENDANCE_FIELDS,
  },
];

export const OPERATORS_BY_TYPE: Record<FieldType, readonly string[]> = {
  string: ["equals", "contains", "startsWith", "endsWith", "notEquals", "isSet", "isNotSet"],
  number: ["equals", "gt", "gte", "lt", "lte", "notEquals"],
  date: ["on", "before", "after", "inLastDays", "isSet", "isNotSet"],
  enum: ["equals", "in", "notEquals"],
  boolean: ["isTrue", "isFalse"],
};

/** Operators that take no value. */
const VALUELESS = new Set(["isSet", "isNotSet", "isTrue", "isFalse"]);

export interface FilterSpec {
  field: string;
  operator: string;
  value?: string;
}

export interface ReportDefinition {
  source: string;
  columns: string[];
  filters?: FilterSpec[];
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  limit?: number;
}

export interface CompileSuccess {
  ok: true;
  source: SourceSpec;
  columns: FieldSpec[];
  where: Record<string, unknown>;
  select: Record<string, unknown>;
  orderBy: Record<string, unknown> | undefined;
  take: number;
}

export interface CompileFailure {
  ok: false;
  errors: string[];
}

export const MAX_ROWS = 1000;

export function findSource(key: string): SourceSpec | undefined {
  return SOURCES.find((source) => source.key === key);
}

/** Builds `{a: {b: {c: leaf}}}` from a path. */
function nestWhere(path: readonly string[], leaf: unknown): Record<string, unknown> {
  return path.reduceRight<unknown>(
    (inner, key) => ({ [key]: inner }),
    leaf,
  ) as Record<string, unknown>;
}

/** Builds a Prisma select tree, using `select` at each relation hop. */
function mergeSelect(
  target: Record<string, unknown>,
  path: readonly string[],
): void {
  if (path.length === 1) {
    target[path[0]] = true;
    return;
  }
  const [head, ...rest] = path;
  const existing = target[head] as { select?: Record<string, unknown> } | undefined;
  const branch = existing?.select ?? {};
  mergeSelect(branch, rest);
  target[head] = { select: branch };
}

function coerceValue(
  field: FieldSpec,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (field.type) {
    case "number": {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        return { ok: false, error: `“${field.label}” needs a number, got “${raw}”.` };
      }
      return { ok: true, value: parsed };
    }
    case "date": {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: `“${field.label}” needs a date, got “${raw}”.` };
      }
      return { ok: true, value: parsed };
    }
    case "enum": {
      // An enum value outside the declared options is rejected rather than
      // forwarded — Prisma would throw, and the message would be unhelpful.
      if (field.options && !field.options.includes(raw)) {
        return {
          ok: false,
          error: `“${raw}” is not a valid ${field.label}. Expected one of: ${field.options.join(", ")}.`,
        };
      }
      return { ok: true, value: raw };
    }
    default:
      return { ok: true, value: raw };
  }
}

function buildCondition(
  field: FieldSpec,
  operator: string,
  raw: string | undefined,
): { ok: true; condition: unknown } | { ok: false; error: string } {
  const allowed = OPERATORS_BY_TYPE[field.type];
  if (!allowed.includes(operator)) {
    return {
      ok: false,
      error: `“${operator}” cannot be used with ${field.label}. Allowed: ${allowed.join(", ")}.`,
    };
  }

  if (VALUELESS.has(operator)) {
    switch (operator) {
      case "isSet":
        return { ok: true, condition: { not: null } };
      case "isNotSet":
        return { ok: true, condition: null };
      case "isTrue":
        return { ok: true, condition: true };
      default:
        return { ok: true, condition: false };
    }
  }

  if (raw === undefined || raw.trim() === "") {
    return { ok: false, error: `“${field.label}” needs a value for “${operator}”.` };
  }

  if (operator === "in") {
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      return { ok: false, error: `“${field.label}” needs at least one value.` };
    }
    for (const part of parts) {
      const coerced = coerceValue(field, part);
      if (!coerced.ok) return coerced;
    }
    return { ok: true, condition: { in: parts } };
  }

  if (operator === "inLastDays") {
    const days = Number(raw);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      return { ok: false, error: "“In the last N days” needs a number between 1 and 3650." };
    }
    const from = new Date(Date.now() - days * 86400000);
    return { ok: true, condition: { gte: from } };
  }

  const coerced = coerceValue(field, raw);
  if (!coerced.ok) return coerced;
  const value = coerced.value;

  switch (operator) {
    case "equals":
      return { ok: true, condition: { equals: value } };
    case "notEquals":
      return { ok: true, condition: { not: value } };
    case "contains":
      return { ok: true, condition: { contains: value, mode: "insensitive" } };
    case "startsWith":
      return { ok: true, condition: { startsWith: value, mode: "insensitive" } };
    case "endsWith":
      return { ok: true, condition: { endsWith: value, mode: "insensitive" } };
    case "gt":
      return { ok: true, condition: { gt: value } };
    case "gte":
      return { ok: true, condition: { gte: value } };
    case "lt":
      return { ok: true, condition: { lt: value } };
    case "lte":
      return { ok: true, condition: { lte: value } };
    case "on": {
      // A whole calendar day, since a stored timestamp will rarely be midnight.
      const start = new Date(value as Date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { ok: true, condition: { gte: start, lt: end } };
    }
    case "before":
      return { ok: true, condition: { lt: value } };
    case "after":
      return { ok: true, condition: { gt: value } };
    default:
      return { ok: false, error: `Unsupported operator “${operator}”.` };
  }
}

/**
 * Validates a definition and compiles it into Prisma query parts.
 *
 * Everything is checked against the registry — an unknown source, column,
 * filter field or operator is an error, never something passed through to the
 * database. The result carries no tenant filter: `scopedDb` adds that when the
 * query runs, so a definition cannot escape its school.
 */
export function compileReport(
  definition: ReportDefinition,
): CompileSuccess | CompileFailure {
  const errors: string[] = [];

  const source = findSource(definition.source);
  if (!source) {
    return { ok: false, errors: [`Unknown data source “${definition.source}”.`] };
  }

  const byKey = new Map(source.fields.map((field) => [field.key, field]));

  const columns: FieldSpec[] = [];
  for (const key of definition.columns ?? []) {
    const field = byKey.get(key);
    if (!field) {
      errors.push(`“${key}” is not a field on ${source.label}.`);
      continue;
    }
    if (!columns.some((existing) => existing.key === field.key)) columns.push(field);
  }
  if (columns.length === 0) {
    errors.push("Choose at least one column.");
  }

  const conditions: Record<string, unknown>[] = [];
  for (const filter of definition.filters ?? []) {
    const field = byKey.get(filter.field);
    if (!field) {
      errors.push(`“${filter.field}” is not a field on ${source.label}.`);
      continue;
    }
    const built = buildCondition(field, filter.operator, filter.value);
    if (!built.ok) {
      errors.push(built.error);
      continue;
    }
    conditions.push(nestWhere(field.path, built.condition));
  }

  let orderBy: Record<string, unknown> | undefined;
  if (definition.sortBy) {
    const field = byKey.get(definition.sortBy);
    if (!field) {
      errors.push(`Cannot sort by “${definition.sortBy}” — not a field on ${source.label}.`);
    } else {
      const direction = definition.sortDirection === "desc" ? "desc" : "asc";
      orderBy = nestWhere(field.path, direction);
    }
  }

  const requested = definition.limit ?? 100;
  if (!Number.isFinite(requested) || requested < 1) {
    errors.push("The row limit must be a positive number.");
  }

  if (errors.length > 0) return { ok: false, errors };

  const select: Record<string, unknown> = {};
  for (const field of columns) mergeSelect(select, field.path);

  const where: Record<string, unknown> = { ...(source.baseWhere ?? {}) };
  if (conditions.length > 0) where.AND = conditions;

  return {
    ok: true,
    source,
    columns,
    where,
    select,
    orderBy,
    // Capped so a saved report cannot be edited into a full table dump.
    take: Math.min(Math.floor(requested), MAX_ROWS),
  };
}

/** Reads a compiled column out of a result row, following its path. */
export function readCell(row: unknown, field: FieldSpec): unknown {
  let current: unknown = row;
  for (const key of field.path) {
    if (current === null || current === undefined) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Serialises rows to CSV.
 *
 * Values beginning with `=`, `+`, `-` or `@` are prefixed with an apostrophe:
 * a spreadsheet would otherwise treat them as formulas, which is how an
 * exported report becomes a way to run code on someone else's machine.
 */
export function toCsv(
  columns: readonly FieldSpec[],
  rows: readonly unknown[],
): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    let text = value instanceof Date ? value.toISOString() : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const header = columns.map((column) => escape(column.label)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escape(readCell(row, column))).join(","),
  );

  return [header, ...body].join("\n");
}
