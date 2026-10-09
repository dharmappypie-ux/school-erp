"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  promoteClass,
  type PromotionState,
} from "@/app/(app)/students/promote/actions";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";

export interface RosterRow {
  studentId: string;
  name: string;
  admissionNo: string;
  rollNumber: string;
}

export interface SectionOption {
  id: string;
  label: string;
  yearName: string;
  seatsLeft: number;
  capacity: number;
}

const OUTCOMES = [
  { value: "PROMOTED", label: "Promote" },
  { value: "RETAINED", label: "Retain — repeat the year" },
  { value: "PASSED_OUT", label: "Passed out — leaves school" },
  { value: "TRANSFERRED", label: "Transferred out" },
];

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || count === 0}>
      {pending ? "Promoting…" : `Promote ${count} student${count === 1 ? "" : "s"}`}
    </Button>
  );
}

export function PromotionForm({
  sourceSectionId,
  sourceLabel,
  roster,
  targets,
}: {
  sourceSectionId: string;
  sourceLabel: string;
  roster: RosterRow[];
  targets: SectionOption[];
}) {
  const [state, formAction] = useActionState<PromotionState, FormData>(
    promoteClass,
    { ok: false, message: "" },
  );
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});

  const target = targets.find((option) => option.id === targetId);
  const promotingCount = roster.filter(
    (row) => (outcomes[row.studentId] ?? "PROMOTED") === "PROMOTED",
  ).length;
  const wouldOverfill = target ? promotingCount > target.seatsLeft : false;

  function setAll(value: string) {
    const next: Record<string, string> = {};
    for (const row of roster) next[row.studentId] = value;
    setOutcomes(next);
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="sourceSectionId" value={sourceSectionId} />

      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      {state.skipped && state.skipped.length > 0 ? (
        <Alert tone="warning" title={`${state.skipped.length} not moved`}>
          <ul className="mt-1 space-y-0.5">
            {state.skipped.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Where they go"
          description={`Moving out of ${sourceLabel}. The target must be in a different academic year.`}
        />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium">
              Promote into
            </span>
            <Select
              name="targetSectionId"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              required
            >
              <option value="">Select a class</option>
              {targets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} · {option.yearName} · {option.seatsLeft} free
                </option>
              ))}
            </Select>
          </label>

          <div className="flex items-end">
            <div className="text-[13px] text-muted">
              {target ? (
                <>
                  <span className="font-medium text-foreground">
                    {promotingCount}
                  </span>{" "}
                  promoting into {target.seatsLeft} free of {target.capacity}{" "}
                  places.
                  {wouldOverfill ? (
                    <span className="mt-1 block text-danger">
                      That is over capacity — tick the box below to go ahead.
                    </span>
                  ) : null}
                </>
              ) : (
                "Choose the class they move into."
              )}
            </div>
          </div>
        </div>

        {wouldOverfill ? (
          <div className="border-t border-border px-5 py-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="allowOverfill"
                value="true"
                className="h-4 w-4 rounded border-border"
              />
              Allow this class to go over capacity
            </label>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title={`${sourceLabel} — ${roster.length} students`}
          description="Everyone is promoted unless you say otherwise"
          action={
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAll("PROMOTED")}
              >
                All promote
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAll("PASSED_OUT")}
              >
                All passed out
              </Button>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Admission no.</Th>
                <Th>Roll</Th>
                <Th>Outcome</Th>
              </tr>
            </thead>
            <tbody>
              {roster.map((row) => {
                const value = outcomes[row.studentId] ?? "PROMOTED";
                return (
                  <tr key={row.studentId}>
                    <Td>
                      <span className="font-medium">{row.name}</span>
                    </Td>
                    <Td>
                      <span className="text-muted">{row.admissionNo}</span>
                    </Td>
                    <Td>
                      <span className="text-muted">{row.rollNumber || "—"}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Select
                          name={`outcome:${row.studentId}`}
                          value={value}
                          onChange={(event) =>
                            setOutcomes((previous) => ({
                              ...previous,
                              [row.studentId]: event.target.value,
                            }))
                          }
                          className="w-56"
                        >
                          {OUTCOMES.map((outcome) => (
                            <option key={outcome.value} value={outcome.value}>
                              {outcome.label}
                            </option>
                          ))}
                        </Select>
                        {value === "RETAINED" ? (
                          <Badge tone="warning">stays</Badge>
                        ) : null}
                        {value === "PASSED_OUT" || value === "TRANSFERRED" ? (
                          <Badge tone="neutral">leaves</Badge>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Submit count={roster.length} />
        <p className="text-[11px] text-muted">
          All of them move together, or none does.
        </p>
      </div>
    </form>
  );
}
