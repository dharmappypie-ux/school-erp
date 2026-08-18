import { prisma } from "@/lib/db";

/**
 * Models that carry a `schoolId` column and are therefore tenant-scoped.
 * Detail tables (invoice lines, route stops, payslip lines …) are deliberately
 * absent: they reach their tenant through a required parent relation, and
 * injecting a non-existent column would throw.
 *
 * Keep in sync with prisma/schema.prisma.
 */
export const TENANT_MODELS = new Set([
  "AcademicYear",
  "User",
  "Role",
  "AuditLog",
  "Department",
  "Designation",
  "ClassLevel",
  "Section",
  "Subject",
  "Student",
  "Guardian",
  "StaffMember",
  "Enrollment",
  "AdmissionApplication",
  "AttendanceRecord",
  "PeriodAttendance",
  "StaffAttendance",
  "BiometricDevice",
  "BiometricPunch",
  "AttendanceAnomaly",
  "FeeCategory",
  "FeeStructure",
  "FeeConcession",
  "Invoice",
  "Payment",
  "LateFeeRule",
  "Expense",
  "ExamTerm",
  "Exam",
  "GradingScheme",
  "MarkEntry",
  "ReportCard",
  "Period",
  "TimetableSlot",
  "Vehicle",
  "Route",
  "TransportAssignment",
  "Book",
  "BookIssue",
  "Hostel",
  "HostelAllocation",
  "SalaryStructure",
  "Payslip",
  "LeaveType",
  "LeaveRequest",
  "Holiday",
  "NotificationTemplate",
  "NotificationLog",
  "Notice",
  "Homework",
  "MessageThread",
  "Document",
  "RiskScore",
  "AiInsight",
  "AiQueryLog",
  "SavedReport",
]);

const READ_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/** Bulk writes accept an arbitrary filter, so the tenant clause can be ANDed. */
const BULK_WRITE_OPERATIONS = new Set([
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

/** Single-row writes need a unique selector; the tenant clause is merged flat. */
const SINGLE_WRITE_OPERATIONS = new Set(["update", "delete", "upsert"]);

type AnyArgs = Record<string, unknown>;

/**
 * Intersects the caller's filter with the tenant filter rather than replacing
 * it. If a caller asks for another school's rows they get nothing, instead of
 * silently receiving their own school's rows under a filter they didn't write.
 */
function andWhere(where: unknown, schoolId: string): AnyArgs {
  const base = where as AnyArgs | undefined;
  if (!base || Object.keys(base).length === 0) return { schoolId };
  return { AND: [base, { schoolId }] };
}

/**
 * Flat merge for `update` / `delete` / `upsert`, whose `where` must still be
 * recognisable as a unique selector — Prisma rejects a bare `AND` wrapper
 * there. Overriding is safe for these: a foreign `schoolId` becomes the
 * caller's own, so the row simply fails to match and the write is refused.
 */
function overrideWhere(where: unknown, schoolId: string): AnyArgs {
  return { ...((where as AnyArgs | undefined) ?? {}), schoolId };
}

/**
 * Expands Prisma's compound-unique selectors into their component fields.
 *
 * `findUnique` accepts `{ schoolId_key: { schoolId, key } }`, but `findFirst`
 * — which this extension rewrites unique lookups into — does not recognise the
 * composite name and rejects the query. Flattening to `{ schoolId, key }`
 * keeps the lookup exact while making it valid for `findFirst`.
 *
 * A key is treated as a compound selector when it contains an underscore
 * (Prisma's naming convention, e.g. `examId_studentId`) and its value is an
 * object of scalars. Relation filters and logical operators are left alone.
 */
function flattenCompoundSelectors(where: unknown): AnyArgs {
  const base = where as AnyArgs | undefined;
  if (!base) return {};

  const result: AnyArgs = {};
  for (const [key, value] of Object.entries(base)) {
    const isCompound =
      key !== "AND" &&
      key !== "OR" &&
      key !== "NOT" &&
      key.includes("_") &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      Object.values(value as AnyArgs).every(
        (inner) =>
          inner === null ||
          typeof inner !== "object" ||
          inner instanceof Date,
      );

    if (isCompound) {
      Object.assign(result, value as AnyArgs);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * A Prisma client pinned to one school.
 *
 * Every read and write against a tenant-scoped model has `schoolId` forced into
 * its `where` clause (and into `data` on create), so a missing filter in
 * application code cannot leak another school's rows.
 *
 * `findUnique` is rewritten to `findFirst` — Prisma only accepts unique fields
 * in a `findUnique` where clause, so the tenant filter could not otherwise be
 * applied. The lookup stays exact because the unique fields are preserved; it
 * simply gains a tenant condition.
 */
export function scopedDb(schoolId: string) {
  if (!schoolId) {
    throw new Error("scopedDb requires a schoolId");
  }

  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) {
            return query(args);
          }

          const next = { ...(args as AnyArgs) };

          if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            next.where = andWhere(
              flattenCompoundSelectors(next.where),
              schoolId,
            );
            const fallback =
              operation === "findUnique" ? "findFirst" : "findFirstOrThrow";
            // Delegate through the base client: the rewritten operation must
            // not re-enter this extension and scope itself twice.
            type Delegate = Record<
              string,
              (args: AnyArgs) => Promise<unknown>
            >;
            const delegate = (
              prisma as unknown as Record<string, Delegate>
            )[lowerFirst(model)];
            return delegate[fallback](next);
          }

          if (READ_OPERATIONS.has(operation) || BULK_WRITE_OPERATIONS.has(operation)) {
            next.where = andWhere(next.where, schoolId);
          } else if (SINGLE_WRITE_OPERATIONS.has(operation)) {
            next.where = overrideWhere(next.where, schoolId);
          }

          if (operation === "create") {
            next.data = { ...((next.data as AnyArgs) ?? {}), schoolId };
          }

          if (operation === "createMany" || operation === "createManyAndReturn") {
            const data = next.data;
            next.data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as AnyArgs), schoolId }))
              : { ...((data as AnyArgs) ?? {}), schoolId };
          }

          if (operation === "upsert") {
            next.create = { ...((next.create as AnyArgs) ?? {}), schoolId };
          }

          return query(next);
        },
      },
    },
  });
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export type ScopedDb = ReturnType<typeof scopedDb>;

/**
 * Guard for records fetched outside `scopedDb` (raw queries, joins through a
 * parent). Throws rather than returning false so a caller cannot ignore it.
 */
export function assertSameSchool(
  record: { schoolId: string } | null | undefined,
  schoolId: string,
  entity = "record",
): void {
  if (!record || record.schoolId !== schoolId) {
    throw new Error(`Cross-tenant access denied for ${entity}`);
  }
}
