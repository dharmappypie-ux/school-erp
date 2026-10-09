"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  commitImport,
  previewImport,
  type ImportState,
} from "@/app/(app)/students/import/actions";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";

const EMPTY: ImportState = { ok: false, message: "" };

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Checking…" : "Check file"}
    </Button>
  );
}

function CommitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Importing…" : `Import ${count} student${count === 1 ? "" : "s"}`}
    </Button>
  );
}

export function ImportForm({ templateCsv }: { templateCsv: string }) {
  const [checkState, checkAction] = useActionState<ImportState, FormData>(
    previewImport,
    EMPTY,
  );
  const [commitState, commitAction] = useActionState<ImportState, FormData>(
    commitImport,
    EMPTY,
  );
  const [fileName, setFileName] = useState("");

  const done = commitState.created !== undefined && commitState.ok;
  const ready = checkState.ok && (checkState.preview?.length ?? 0) > 0 && !done;
  const rows = checkState.preview ?? [];

  function downloadTemplate() {
    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "student-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {done ? (
        <Alert tone="success" title="Import complete">
          {commitState.message} They are on the roll now.
        </Alert>
      ) : null}

      {commitState.message && !commitState.ok ? (
        <Alert tone="danger">{commitState.message}</Alert>
      ) : null}

      <Card>
        <CardHeader
          title="1 · Choose the file"
          description="An Excel workbook (.xlsx) or a CSV. Column names are matched loosely — “Adm No”, “Admission Number” and “SR No” all work."
          action={
            <Button type="button" variant="secondary" onClick={downloadTemplate}>
              Download template
            </Button>
          }
        />
        <form action={checkAction} className="space-y-3 px-5 pb-5">
          <input
            type="file"
            name="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
            className="block w-full cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
          />
          {fileName ? (
            <p className="text-[11px] text-muted">Selected: {fileName}</p>
          ) : null}
          <UploadButton />
        </form>
      </Card>

      {checkState.message ? (
        <Alert tone={checkState.ok ? "success" : "danger"}>
          {checkState.message}
        </Alert>
      ) : null}

      {checkState.unmatchedColumns && checkState.unmatchedColumns.length > 0 ? (
        <Alert tone="warning" title="Columns that were not recognised">
          These were ignored — nothing in them will be imported:{" "}
          {checkState.unmatchedColumns.join(", ")}.
        </Alert>
      ) : null}

      {checkState.issues && checkState.issues.length > 0 ? (
        <Card>
          <CardHeader
            title={`${checkState.issues.length} to fix`}
            description="Correct these in the spreadsheet and upload it again. Nothing has been written."
          />
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Row</Th>
                  <Th>Column</Th>
                  <Th>Problem</Th>
                </tr>
              </thead>
              <tbody>
                {checkState.issues.map((issue, index) => (
                  <tr key={`${issue.row}-${issue.column}-${index}`}>
                    <Td>
                      <span className="font-mono text-muted">{issue.row}</span>
                    </Td>
                    <Td>{issue.column}</Td>
                    <Td>{issue.message}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      ) : null}

      {ready ? (
        <Card>
          <CardHeader
            title={`2 · Check these look right — ${rows.length} students`}
            description="Showing the first 25. Nothing is written until you press import."
          />
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Row</Th>
                  <Th>Admission no.</Th>
                  <Th>Name</Th>
                  <Th>Class</Th>
                  <Th>Date of birth</Th>
                  <Th>Guardian</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row) => (
                  <tr key={row.row}>
                    <Td>
                      <span className="font-mono text-muted">{row.row}</span>
                    </Td>
                    <Td>{row.admissionNo}</Td>
                    <Td>
                      <span className="font-medium">
                        {[row.firstName, row.middleName, row.lastName]
                          .filter(Boolean)
                          .join(" ")}
                      </span>
                    </Td>
                    <Td>
                      {row.className ? (
                        `${row.className} ${row.sectionName ?? ""}`
                      ) : (
                        <Badge tone="warning">no class</Badge>
                      )}
                    </Td>
                    <Td>
                      <span className="text-muted">
                        {row.dateOfBirth
                          ? new Date(row.dateOfBirth).toISOString().slice(0, 10)
                          : "—"}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-muted">
                        {row.guardianName ?? "—"}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          {rows.length > 25 ? (
            <p className="border-t border-border px-5 py-2 text-[11px] text-muted">
              …and {rows.length - 25} more.
            </p>
          ) : null}

          <form action={commitAction} className="border-t border-border px-5 py-4">
            <input type="hidden" name="payload" value={JSON.stringify(rows)} />
            <div className="flex items-center gap-3">
              <CommitButton count={rows.length} />
              <p className="text-[11px] text-muted">
                All of them are created together, or none is.
              </p>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
