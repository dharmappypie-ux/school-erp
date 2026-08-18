"use client";

import { useState, useTransition } from "react";

import {
  auditTimetable,
  generateTimetableFor,
} from "@/app/(app)/timetable/actions";
import { Alert, Button, Field, Select } from "@/components/ui";

export function GeneratePanel({
  classLevels,
  canManage,
}: {
  classLevels: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [classLevelId, setClassLevelId] = useState("");
  const [workingDays, setWorkingDays] = useState("6");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4 px-5 py-5">
      {result ? (
        <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>
      ) : null}

      {canManage ? (
        <>
          <Field label="Scope" hint="Regenerating replaces the existing grid for these sections.">
            <Select
              value={classLevelId}
              onChange={(event) => setClassLevelId(event.target.value)}
            >
              <option value="">Whole school</option>
              {classLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Working days">
            <Select
              value={workingDays}
              onChange={(event) => setWorkingDays(event.target.value)}
            >
              <option value="5">Monday to Friday</option>
              <option value="6">Monday to Saturday</option>
            </Select>
          </Field>

          <Button
            className="w-full"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setResult(
                  await generateTimetableFor({
                    classLevelId: classLevelId || undefined,
                    workingDays: Number(workingDays),
                  }),
                );
              })
            }
          >
            {pending ? "Scheduling…" : "Generate timetable"}
          </Button>
        </>
      ) : null}

      <Button
        variant="secondary"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const report = await auditTimetable();
            setResult({ ok: report.ok, message: report.message });
          })
        }
      >
        Check for clashes
      </Button>

      <p className="text-xs text-muted">
        The generator places every subject&rsquo;s weekly periods without ever
        putting a teacher in two rooms at once. If demand exceeds the free
        slots, it reports the shortfall rather than producing a clashing grid.
      </p>
    </div>
  );
}
