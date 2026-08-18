"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { saveMarks } from "@/app/(app)/exams/actions";
import { Alert, Badge, Button, Td, Th, cn } from "@/components/ui";
import { initials } from "@/lib/format";

export interface MarksRow {
  studentId: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  rollNumber: string | null;
  marks: string;
  isAbsent: boolean;
}

export function MarksGrid({
  examId,
  sectionId,
  maxMarks,
  passMarks,
  rows,
  readOnly,
}: {
  examId: string;
  sectionId: string;
  maxMarks: number;
  passMarks: number;
  rows: MarksRow[];
  readOnly: boolean;
}) {
  const [state, setState] = useState<Record<string, { marks: string; isAbsent: boolean }>>(
    () =>
      Object.fromEntries(
        rows.map((row) => [row.studentId, { marks: row.marks, isAbsent: row.isAbsent }]),
      ),
  );
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const stats = useMemo(() => {
    const values = rows
      .map((row) => state[row.studentId])
      .filter((entry) => entry && !entry.isAbsent && entry.marks.trim() !== "")
      .map((entry) => Number(entry.marks))
      .filter((value) => Number.isFinite(value));

    const absent = rows.filter((row) => state[row.studentId]?.isAbsent).length;
    const entered = values.length;
    const failing = values.filter((value) => value < passMarks).length;
    const average =
      values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    const highest = values.length > 0 ? Math.max(...values) : null;

    return { entered, absent, failing, average, highest, pending: rows.length - entered - absent };
  }, [rows, state, passMarks]);

  const invalidIds = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => {
            const entry = state[row.studentId];
            if (!entry || entry.isAbsent) return false;
            const trimmed = entry.marks.trim();
            if (trimmed === "") return false;
            const value = Number(trimmed);
            return !Number.isFinite(value) || value < 0 || value > maxMarks;
          })
          .map((row) => row.studentId),
      ),
    [rows, state, maxMarks],
  );

  /** Enter and arrow keys walk down the column, the way a mark sheet is filled. */
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  }

  function submit() {
    startTransition(async () => {
      const response = await saveMarks({
        examId,
        sectionId,
        entries: rows.map((row) => ({
          studentId: row.studentId,
          marks: state[row.studentId]?.marks ?? "",
          isAbsent: state[row.studentId]?.isAbsent ?? false,
        })),
      });
      setResult(response);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="success">Entered {stats.entered}</Badge>
          <Badge tone="neutral">Pending {stats.pending}</Badge>
          <Badge tone="info">Absent {stats.absent}</Badge>
          {stats.failing > 0 ? <Badge tone="danger">Below pass {stats.failing}</Badge> : null}
          {stats.average !== null ? (
            <span className="text-muted">
              Average {stats.average.toFixed(1)} · Highest {stats.highest}
            </span>
          ) : null}
        </div>

        {!readOnly ? (
          <Button size="sm" onClick={submit} disabled={pending || invalidIds.size > 0}>
            {pending ? "Saving…" : "Save marks"}
          </Button>
        ) : null}
      </div>

      {invalidIds.size > 0 ? (
        <div className="px-5 pt-4">
          <Alert tone="danger">
            {invalidIds.size} entr{invalidIds.size === 1 ? "y is" : "ies are"} outside
            the range 0–{maxMarks}. Correct them before saving.
          </Alert>
        </div>
      ) : null}

      {result ? (
        <div className="px-5 pt-4">
          <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>
        </div>
      ) : null}

      <div className="scroll-slim w-full overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr>
              <Th className="w-16">Roll</Th>
              <Th>Student</Th>
              <Th className="w-32 text-right">Marks / {maxMarks}</Th>
              <Th className="w-24 text-center">Absent</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const entry = state[row.studentId] ?? { marks: "", isAbsent: false };
              const invalid = invalidIds.has(row.studentId);
              const value = Number(entry.marks);
              const below =
                !entry.isAbsent &&
                entry.marks.trim() !== "" &&
                Number.isFinite(value) &&
                value < passMarks;

              return (
                <tr key={row.studentId} className="hover:bg-surface-hover">
                  <Td className="numeric text-muted">{row.rollNumber ?? "—"}</Td>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand">
                        {initials(row.firstName, row.lastName)}
                      </span>
                      <span>
                        <span className="block font-medium">
                          {row.firstName} {row.lastName}
                        </span>
                        <span className="block font-mono text-[11px] text-muted">
                          {row.admissionNo}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td className="text-right">
                    <input
                      ref={(element) => {
                        inputRefs.current[index] = element;
                      }}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={maxMarks}
                      step="0.5"
                      value={entry.marks}
                      disabled={readOnly || entry.isAbsent}
                      aria-label={`Marks for ${row.firstName} ${row.lastName ?? ""}`}
                      aria-invalid={invalid}
                      onKeyDown={(event) => handleKeyDown(event, index)}
                      onChange={(event) =>
                        setState((previous) => ({
                          ...previous,
                          [row.studentId]: {
                            marks: event.target.value,
                            isAbsent: false,
                          },
                        }))
                      }
                      className={cn(
                        "numeric h-8 w-24 rounded-[var(--radius-base)] border bg-surface px-2 text-right text-sm disabled:opacity-45",
                        invalid
                          ? "border-danger text-danger"
                          : below
                            ? "border-warning text-warning"
                            : "border-border-strong",
                      )}
                    />
                  </Td>
                  <Td className="text-center">
                    <input
                      type="checkbox"
                      checked={entry.isAbsent}
                      disabled={readOnly}
                      aria-label={`Mark ${row.firstName} absent`}
                      onChange={(event) =>
                        setState((previous) => ({
                          ...previous,
                          [row.studentId]: {
                            marks: event.target.checked ? "" : (previous[row.studentId]?.marks ?? ""),
                            isAbsent: event.target.checked,
                          },
                        }))
                      }
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
