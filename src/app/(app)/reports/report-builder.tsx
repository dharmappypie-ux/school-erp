"use client";

import { useMemo, useState, useTransition } from "react";

import {
  deleteReport,
  loadReport,
  runReport,
  saveReport,
  type RunResult,
} from "@/app/(app)/reports/actions";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import {
  OPERATORS_BY_TYPE,
  SOURCES,
  type FilterSpec,
} from "@/lib/reports";

const OPERATOR_LABELS: Record<string, string> = {
  equals: "is",
  notEquals: "is not",
  contains: "contains",
  startsWith: "starts with",
  endsWith: "ends with",
  isSet: "is set",
  isNotSet: "is empty",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  on: "on",
  before: "before",
  after: "after",
  inLastDays: "in the last N days",
  in: "is one of",
  isTrue: "is yes",
  isFalse: "is no",
};

const VALUELESS = new Set(["isSet", "isNotSet", "isTrue", "isFalse"]);

export interface SavedReportSummary {
  id: string;
  name: string;
  description: string | null;
  isShared: boolean;
  ownedByMe: boolean;
  ownerName: string | null;
}

export function ReportBuilder({
  allowedSources,
  saved,
}: {
  allowedSources: string[];
  saved: SavedReportSummary[];
}) {
  const sources = useMemo(
    () => SOURCES.filter((source) => allowedSources.includes(source.key)),
    [allowedSources],
  );

  const [sourceKey, setSourceKey] = useState(sources[0]?.key ?? "");
  const [columns, setColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterSpec[]>([]);
  const [sortBy, setSortBy] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState("100");

  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);

  const [result, setResult] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const source = sources.find((entry) => entry.key === sourceKey);
  const fields = source?.fields ?? [];

  const definition = {
    source: sourceKey,
    columns,
    filters: filters.filter((filter) => filter.field && filter.operator),
    sortBy: sortBy || undefined,
    sortDirection,
    limit: Number(limit) || 100,
  };

  function switchSource(key: string) {
    // Columns and filters name fields on the old source, so they cannot carry
    // over — keeping them would only produce validation errors.
    setSourceKey(key);
    setColumns([]);
    setFilters([]);
    setSortBy("");
    setResult(null);
  }

  function toggleColumn(key: string) {
    setColumns((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
    setResult(null);
  }

  function updateFilter(index: number, patch: Partial<FilterSpec>) {
    setFilters((current) =>
      current.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)),
    );
    setResult(null);
  }

  function download() {
    if (!result?.csv) return;
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(name || source?.label || "report").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (sources.length === 0) {
    return (
      <Alert tone="warning" title="No data sources available">
        Reporting needs read access to at least one area — students, staff, fees
        or attendance. Ask an administrator to grant it.
      </Alert>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader
            title="Build a report"
            description="Pick a source, choose columns, add filters"
          />
          <div className="space-y-4 px-5 py-5">
            {notice ? (
              <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert>
            ) : null}

            <Field label="Data source" required>
              <Select
                value={sourceKey}
                onChange={(event) => switchSource(event.target.value)}
              >
                {sources.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label} — {entry.description}
                  </option>
                ))}
              </Select>
            </Field>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted-strong">
                Columns <span className="text-danger">*</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {fields.map((field) => {
                  const active = columns.includes(field.key);
                  return (
                    <button
                      key={field.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleColumn(field.key)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        active
                          ? "border-brand bg-brand-soft text-brand"
                          : "border-border-strong text-muted hover:bg-surface-hover",
                      )}
                    >
                      {field.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                {columns.length} selected · shown in the order you pick them
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-strong">Filters</span>
                <button
                  type="button"
                  onClick={() =>
                    setFilters((current) => [
                      ...current,
                      { field: fields[0]?.key ?? "", operator: "", value: "" },
                    ])
                  }
                  className="text-[11px] font-medium text-brand"
                >
                  + Add filter
                </button>
              </div>

              {filters.length === 0 ? (
                <p className="text-[11px] text-muted">
                  No filters — every row will be returned, up to the limit.
                </p>
              ) : (
                <div className="space-y-2">
                  {filters.map((filter, index) => {
                    const field = fields.find((entry) => entry.key === filter.field);
                    const operators = field ? OPERATORS_BY_TYPE[field.type] : [];
                    const needsValue = !VALUELESS.has(filter.operator);

                    return (
                      <div key={index} className="flex flex-wrap items-center gap-1.5">
                        <Select
                          aria-label="Field"
                          value={filter.field}
                          onChange={(event) =>
                            updateFilter(index, {
                              field: event.target.value,
                              operator: "",
                              value: "",
                            })
                          }
                          className="w-auto min-w-32"
                        >
                          {fields.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                              {entry.label}
                            </option>
                          ))}
                        </Select>

                        <Select
                          aria-label="Operator"
                          value={filter.operator}
                          onChange={(event) =>
                            updateFilter(index, { operator: event.target.value })
                          }
                          className="w-auto min-w-28"
                        >
                          <option value="">choose…</option>
                          {operators.map((operator) => (
                            <option key={operator} value={operator}>
                              {OPERATOR_LABELS[operator] ?? operator}
                            </option>
                          ))}
                        </Select>

                        {needsValue && filter.operator ? (
                          field?.options ? (
                            <Select
                              aria-label="Value"
                              value={filter.value ?? ""}
                              onChange={(event) =>
                                updateFilter(index, { value: event.target.value })
                              }
                              className="w-auto min-w-32"
                            >
                              <option value="">choose…</option>
                              {field.options.map((option) => (
                                <option key={option} value={option}>
                                  {option.replace("_", " ").toLowerCase()}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <Input
                              aria-label="Value"
                              value={filter.value ?? ""}
                              onChange={(event) =>
                                updateFilter(index, { value: event.target.value })
                              }
                              placeholder={
                                field?.type === "date"
                                  ? "YYYY-MM-DD"
                                  : field?.type === "number"
                                    ? "0"
                                    : "value"
                              }
                              className="w-40"
                            />
                          )
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            setFilters((current) =>
                              current.filter((_, i) => i !== index),
                            )
                          }
                          aria-label="Remove filter"
                          className="rounded-[var(--radius-base)] border border-border-strong px-2 py-1 text-[11px] text-muted hover:bg-surface-hover"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Sort by">
                <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="">No sorting</option>
                  {fields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Direction">
                <Select
                  value={sortDirection}
                  onChange={(event) =>
                    setSortDirection(event.target.value as "asc" | "desc")
                  }
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </Select>
              </Field>
              <Field label="Row limit" hint="Capped at 1000.">
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  className="numeric"
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={pending || columns.length === 0}
                onClick={() =>
                  startTransition(async () => {
                    setNotice(null);
                    setResult(await runReport(definition));
                  })
                }
              >
                {pending ? "Running…" : "Run report"}
              </Button>
              {result?.ok ? (
                <Button variant="secondary" onClick={download}>
                  Download CSV
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        {result ? (
          <Card>
            <CardHeader
              title="Results"
              description={result.ok ? result.message : undefined}
              action={
                result.truncated ? (
                  <Badge tone="warning">truncated at the row limit</Badge>
                ) : null
              }
            />
            {!result.ok ? (
              <div className="px-5 py-4">
                <Alert tone="danger">{result.message}</Alert>
              </div>
            ) : result.rows?.length === 0 ? (
              <EmptyState
                title="No rows matched"
                description="Try relaxing or removing a filter."
              />
            ) : (
              <>
                {result.truncated ? (
                  <div className="px-5 pt-4">
                    <Alert tone="warning">
                      Exactly {result.rowCount} rows came back, which is the
                      limit — there are probably more. Raise the limit or narrow
                      the filters before drawing conclusions.
                    </Alert>
                  </div>
                ) : null}
                <Table>
                  <thead>
                    <tr>
                      {result.columns?.map((column) => (
                        <Th key={column.key}>{column.label}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows?.slice(0, 200).map((row, index) => (
                      <tr key={index} className="hover:bg-surface-hover">
                        {row.map((cell, cellIndex) => (
                          <Td key={cellIndex}>
                            {cell === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              cell
                            )}
                          </Td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {(result.rows?.length ?? 0) > 200 ? (
                  <p className="px-5 py-3 text-xs text-muted">
                    Showing the first 200 of {result.rowCount} rows. Download the
                    CSV for the rest.
                  </p>
                ) : null}
              </>
            )}
          </Card>
        ) : null}
      </div>

      <div className="space-y-4">
        <Card className="h-fit">
          <CardHeader title="Save" description="Re-run this later" />
          <div className="space-y-3 px-5 py-5">
            <Field label="Report name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Overdue fees by class"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(event) => setIsShared(event.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Share with colleagues
            </label>
            <Button
              variant="secondary"
              className="w-full"
              disabled={pending || columns.length === 0 || name.trim().length < 2}
              onClick={() =>
                startTransition(async () => {
                  const response = await saveReport({
                    name,
                    isShared,
                    definition,
                  });
                  setNotice(response);
                  if (response.ok) setName("");
                })
              }
            >
              Save report
            </Button>
            <p className="text-xs text-muted">
              Anyone running a shared report still needs permission for its data
              source — sharing a report does not share access.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Saved reports" description={`${saved.length} available`} />
          {saved.length === 0 ? (
            <EmptyState title="Nothing saved yet" />
          ) : (
            <ul className="divide-y divide-border">
              {saved.map((report) => (
                <li key={report.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{report.name}</p>
                      <p className="text-[11px] text-muted">
                        {report.ownedByMe ? "yours" : `by ${report.ownerName ?? "another user"}`}
                        {report.isShared ? " · shared" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const loaded = await loadReport(report.id);
                            if (!loaded.ok || !loaded.definition) {
                              setNotice({ ok: false, message: loaded.message });
                              return;
                            }
                            const def = loaded.definition;
                            setSourceKey(def.source);
                            setColumns(def.columns);
                            setFilters(def.filters ?? []);
                            setSortBy(def.sortBy ?? "");
                            setSortDirection(def.sortDirection ?? "asc");
                            setLimit(String(def.limit ?? 100));
                            setName(report.name);
                            setResult(null);
                            setNotice({ ok: true, message: `Loaded “${report.name}”.` });
                          })
                        }
                        className="text-[11px] font-medium text-brand"
                      >
                        Load
                      </button>
                      {report.ownedByMe ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setNotice(await deleteReport(report.id));
                            })
                          }
                          className="text-[11px] font-medium text-danger"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
