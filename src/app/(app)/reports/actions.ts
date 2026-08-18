"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import {
  compileReport,
  findSource,
  readCell,
  toCsv,
  type FieldSpec,
  type ReportDefinition,
} from "@/lib/reports";
import { scopedDb, type ScopedDb } from "@/lib/tenant";

export interface RunResult {
  ok: boolean;
  message: string;
  columns?: { key: string; label: string }[];
  rows?: (string | null)[][];
  rowCount?: number;
  truncated?: boolean;
  csv?: string;
  durationMs?: number;
}

const FilterSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.string().optional(),
});

const DefinitionSchema = z.object({
  source: z.string().min(1),
  columns: z.array(z.string().min(1)).max(20),
  filters: z.array(FilterSchema).max(10).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().optional(),
});

/** Formats a value for display, keeping dates and decimals readable. */
function present(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "toString" in value) return String(value);
  return String(value);
}

/**
 * Runs a report definition.
 *
 * Two gates before anything is read: the definition must compile against the
 * whitelist, and the caller must hold the source's own permission. The second
 * matters most — without it the report builder would become a way to read data
 * the user cannot open anywhere else in the app.
 */
export async function runReport(
  definition: ReportDefinition,
): Promise<RunResult> {
  const parsed = DefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid report." };
  }

  const session = await requirePermission("reports.build");
  const compiled = compileReport(parsed.data as ReportDefinition);
  if (!compiled.ok) {
    return { ok: false, message: compiled.errors.join(" ") };
  }

  if (!hasPermission(session.permissions, compiled.source.permission)) {
    return {
      ok: false,
      message: `You need “${compiled.source.permission}” to report on ${compiled.source.label}.`,
    };
  }

  const db = scopedDb(session.schoolId);
  const delegate = (db as unknown as Record<string, {
    findMany: (args: unknown) => Promise<unknown[]>;
  }>)[compiled.source.model];

  if (!delegate) {
    return { ok: false, message: "That data source is not available." };
  }

  const started = Date.now();
  let records: unknown[];
  try {
    // scopedDb injects schoolId here — the definition never carries a tenant.
    records = await delegate.findMany({
      where: compiled.where,
      select: compiled.select,
      orderBy: compiled.orderBy,
      take: compiled.take,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `The report could not be run: ${message}` };
  }
  const durationMs = Date.now() - started;

  const rows = records.map((record) =>
    compiled.columns.map((column: FieldSpec) => present(readCell(record, column))),
  );

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "reports.run",
    entityType: "SavedReport",
    entityId: compiled.source.key,
    after: {
      source: compiled.source.key,
      columns: compiled.columns.map((column) => column.key),
      filters: parsed.data.filters?.length ?? 0,
      rows: rows.length,
      durationMs,
    },
  });

  return {
    ok: true,
    message: `${rows.length} rows in ${durationMs}ms.`,
    columns: compiled.columns.map((column) => ({
      key: column.key,
      label: column.label,
    })),
    rows,
    rowCount: rows.length,
    // At the cap the result is almost certainly incomplete, and saying so
    // matters — a truncated report read as complete is a wrong decision.
    truncated: rows.length === compiled.take,
    csv: toCsv(compiled.columns, records),
    durationMs,
  };
}

const SaveSchema = z.object({
  name: z.string().trim().min(2, "Give the report a name").max(120),
  description: z.string().trim().max(400).optional(),
  isShared: z.boolean().optional(),
  definition: DefinitionSchema,
});

export interface SaveResult {
  ok: boolean;
  message: string;
}

/** Saves a definition for re-running later. */
export async function saveReport(
  input: z.infer<typeof SaveSchema>,
): Promise<SaveResult> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("reports.build");
  const compiled = compileReport(parsed.data.definition as ReportDefinition);
  if (!compiled.ok) {
    return { ok: false, message: `Cannot save an invalid report: ${compiled.errors.join(" ")}` };
  }
  if (!hasPermission(session.permissions, compiled.source.permission)) {
    return {
      ok: false,
      message: `You need “${compiled.source.permission}” to report on ${compiled.source.label}.`,
    };
  }

  const db = scopedDb(session.schoolId);
  await db.savedReport.create({
    data: {
      schoolId: session.schoolId,
      ownerId: session.userId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      isShared: parsed.data.isShared ?? false,
      definition: parsed.data.definition as never,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "reports.save",
    entityType: "SavedReport",
    after: { name: parsed.data.name, source: compiled.source.key },
  });

  revalidatePath("/reports");
  return { ok: true, message: `“${parsed.data.name}” saved.` };
}

/** Deletes a saved report the caller owns. */
export async function deleteReport(id: string): Promise<SaveResult> {
  const session = await requirePermission("reports.build");
  const db = scopedDb(session.schoolId);

  const report = await db.savedReport.findUnique({
    where: { id },
    select: { id: true, name: true, ownerId: true },
  });
  if (!report) return { ok: false, message: "Report not found in your school." };

  // A shared report belongs to whoever built it; others may run it, not remove it.
  if (report.ownerId !== session.userId) {
    return { ok: false, message: "Only the person who created this report can delete it." };
  }

  await db.savedReport.delete({ where: { id } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "reports.delete",
    entityType: "SavedReport",
    entityId: id,
    before: { name: report.name },
  });

  revalidatePath("/reports");
  return { ok: true, message: `“${report.name}” deleted.` };
}

/** Loads a saved definition so the builder can populate itself. */
export async function loadReport(
  id: string,
): Promise<{ ok: boolean; message: string; definition?: ReportDefinition }> {
  const session = await requirePermission("reports.build");
  const db = scopedDb(session.schoolId);

  const report = await db.savedReport.findUnique({
    where: { id },
    select: { id: true, name: true, definition: true, ownerId: true, isShared: true },
  });
  if (!report) return { ok: false, message: "Report not found in your school." };
  if (!report.isShared && report.ownerId !== session.userId) {
    return { ok: false, message: "That report has not been shared with you." };
  }

  const parsed = DefinitionSchema.safeParse(report.definition);
  if (!parsed.success) {
    return {
      ok: false,
      message: "This saved report no longer matches the available fields and must be rebuilt.",
    };
  }

  const compiled = compileReport(parsed.data as ReportDefinition);
  if (!compiled.ok) {
    // Fields can be removed from the registry after a report was saved.
    return { ok: false, message: `This saved report is no longer valid: ${compiled.errors.join(" ")}` };
  }

  return { ok: true, message: report.name, definition: parsed.data as ReportDefinition };
}

/** Sources the caller may actually report on. */
export async function availableSources(
  permissions: readonly string[],
): Promise<string[]> {
  return SOURCE_KEYS.filter((key) => {
    const source = findSource(key);
    return source ? hasPermission(permissions, source.permission) : false;
  });
}

const SOURCE_KEYS = ["students", "staff", "invoices", "payments", "attendance"];

export type { ScopedDb };
