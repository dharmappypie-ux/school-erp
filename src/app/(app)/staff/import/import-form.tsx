"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  commitStaffImport,
  previewStaffImport,
  type StaffImportState,
} from "@/app/(app)/staff/import/actions";
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

const EMPTY: StaffImportState = { ok: false, message: "" };

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
      {pending
        ? "Creating logins…"
        : `Import ${count} staff member${count === 1 ? "" : "s"}`}
    </Button>
  );
}

export function ImportForm({ templateCsv }: { templateCsv: string }) {
  const [checkState, checkAction] = useActionState<StaffImportState, FormData>(
    previewStaffImport,
    EMPTY,
  );
  const [commitState, commitAction] = useActionState<StaffImportState, FormData>(
    commitStaffImport,
    EMPTY,
  );
  const [fileName, setFileName] = useState("");

  const done = commitState.created !== undefined && commitState.ok;
  // A finished import must not block the next one. The row cap means a large
  // school splits its file, so uploading part two is the normal path, not an
  // edge case — and `done` would otherwise stay true until a page reload.
  const previewIsNewer =
    checkState.ok && (checkState.preview?.[0]?.email ?? "") !== (commitState.createdStaff?.[0]?.email ?? "");
  const ready =
    checkState.ok && (checkState.preview?.length ?? 0) > 0 && (!done || previewIsNewer);
  const rows = checkState.preview ?? [];
  const created = commitState.createdStaff ?? [];

  function downloadTemplate() {
    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "staff-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {done ? (
        <>
          <Alert tone="success" title="Import complete">
            {commitState.message} {commitState.passwordRule}
          </Alert>

          {created.length > 0 ? (
            <Card>
              <CardHeader
                title="Hand these out"
                description="Nobody else has these sign-ins yet. Each person must change the password when they first sign in."
              />
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Employee ID</Th>
                      <Th>Name</Th>
                      <Th>Signs in with</Th>
                      <Th>Temporary password</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {created.map((person) => (
                      <tr key={person.employeeId}>
                        <Td>
                          <span className="font-mono">{person.employeeId}</span>
                        </Td>
                        <Td>
                          <span className="font-medium">{person.name}</span>
                        </Td>
                        <Td>
                          <span className="text-muted">{person.email}</span>
                        </Td>
                        <Td>
                          <span className="font-mono">{person.password}</span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      {commitState.message && !commitState.ok ? (
        <Alert tone="danger">{commitState.message}</Alert>
      ) : null}

      {commitState.issues && commitState.issues.length > 0 ? (
        <Card>
          <CardHeader
            title={`${commitState.issues.length} to fix`}
            description="Upload the file again once these are sorted out. Nothing was written."
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
                {commitState.issues.map((issue, index) => (
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

      <Card>
        <CardHeader
          title="1 · Choose the file"
          description="An Excel workbook (.xlsx) or a CSV. Column names are matched loosely — “Emp ID”, “Employee Code” and “Staff ID” all work."
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
            title={`2 · Check these look right — ${rows.length} staff`}
            description="Showing the first 25. Nothing is written until you press import."
          />

          {/* The one thing a reviewer must read before pressing the button:
              this creates logins, and these are the passwords they start with. */}
          {checkState.passwordRule ? (
            <div className="px-5 pt-4">
              <Alert tone="warning" title="Each row creates a sign-in">
                {checkState.passwordRule} Check the roles below — the role is
                what each person will be able to open.
              </Alert>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Row</Th>
                  <Th>Employee ID</Th>
                  <Th>Name</Th>
                  <Th>Signs in with</Th>
                  <Th>Role</Th>
                  <Th>Department</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row) => (
                  <tr key={row.row}>
                    <Td>
                      <span className="font-mono text-muted">{row.row}</span>
                    </Td>
                    <Td>
                      {row.employeeId ? (
                        <span className="font-mono">{row.employeeId}</span>
                      ) : (
                        <Badge tone="neutral">generated</Badge>
                      )}
                    </Td>
                    <Td>
                      <span className="font-medium">
                        {[row.firstName, row.lastName].filter(Boolean).join(" ")}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-muted">{row.email}</span>
                    </Td>
                    <Td>
                      <Badge tone="brand">{row.roleKey}</Badge>
                    </Td>
                    <Td>
                      <span className="text-muted">
                        {row.departmentName ?? "—"}
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
