import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { compileReport, readCell, type FieldSpec, type ReportDefinition } from "@/lib/reports";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const FilterSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.string().optional(),
});
const Schema = z.object({
  source: z.string().min(1),
  columns: z.array(z.string().min(1)).max(20),
  filters: z.array(FilterSchema).max(10).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().optional(),
});

function present(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "toString" in value) return String(value);
  return String(value);
}

/**
 * POST /api/mobile/v1/admin/reports/run — compile + run a report definition and
 * return its columns and rows. Mirror of the web `runReport`. Gated on reports.build
 * plus the chosen source's own permission.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "reports.build", { feature: "reports" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid report." }, { status: 400 }));
  }

  const compiled = compileReport(parsed.data as ReportDefinition);
  if (!compiled.ok) {
    return cors(NextResponse.json({ error: compiled.errors.join(" ") }, { status: 400 }));
  }
  if (!hasPermission(session.permissions, compiled.source.permission)) {
    return cors(NextResponse.json(
      { error: `You need “${compiled.source.permission}” to report on ${compiled.source.label}.` },
      { status: 403 },
    ));
  }

  const db = scopedDb(session.schoolId);
  const delegate = (db as unknown as Record<string, { findMany: (args: unknown) => Promise<unknown[]> }>)[compiled.source.model];
  if (!delegate) return cors(NextResponse.json({ error: "That data source is not available." }, { status: 400 }));

  let records: unknown[];
  try {
    records = await delegate.findMany({
      where: compiled.where, select: compiled.select, orderBy: compiled.orderBy, take: compiled.take,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cors(NextResponse.json({ error: `The report could not be run: ${message}` }, { status: 400 }));
  }

  const rows = records.map((record) => compiled.columns.map((c: FieldSpec) => present(readCell(record, c))));

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "reports.run", entityType: "SavedReport", entityId: compiled.source.key,
    after: { source: compiled.source.key, rows: rows.length, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `${rows.length} rows.`,
    columns: compiled.columns.map((c) => ({ key: c.key, label: c.label })),
    rows,
    rowCount: rows.length,
    truncated: rows.length === compiled.take,
  }));
}
