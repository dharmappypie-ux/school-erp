"use client";

import { useState, useTransition } from "react";

import { enrolApplicant, moveApplication } from "@/app/(app)/admissions/actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/admissions";
import type { ApplicationStatus } from "@/generated/prisma/enums";

export function DecisionPanel({
  applicationId,
  currentStatus,
  allowedNext,
  sections,
  canEnrol,
}: {
  applicationId: string;
  currentStatus: ApplicationStatus;
  allowedNext: ApplicationStatus[];
  sections: { id: string; label: string; seatsLeft: number }[];
  canEnrol: boolean;
}) {
  const [note, setNote] = useState("");
  const [target, setTarget] = useState<ApplicationStatus | "">(
    allowedNext.find((status) => status !== "WITHDRAWN") ?? allowedNext[0] ?? "",
  );
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const readyToEnrol = currentStatus === "ACCEPTED";

  function move() {
    if (!target) return;
    startTransition(async () => {
      setResult(await moveApplication({ applicationId, toStatus: target, note }));
      setNote("");
    });
  }

  function enrol() {
    startTransition(async () => {
      setResult(await enrolApplicant({ applicationId, sectionId }));
    });
  }

  return (
    <div className="space-y-4 px-5 py-5">
      {result ? (
        <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>
      ) : null}

      {readyToEnrol && canEnrol ? (
        <>
          <Field
            label="Section"
            required
            hint="Only sections of the applied-for class are listed."
          >
            <Select
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
            >
              {sections.length === 0 ? (
                <option value="">No sections available</option>
              ) : (
                sections.map((section) => (
                  <option key={section.id} value={section.id} disabled={section.seatsLeft <= 0}>
                    {section.label} — {section.seatsLeft} seat
                    {section.seatsLeft === 1 ? "" : "s"} left
                  </option>
                ))
              )}
            </Select>
          </Field>

          <Button
            className="w-full"
            disabled={pending || !sectionId}
            onClick={enrol}
          >
            {pending ? "Enrolling…" : "Enrol as student"}
          </Button>

          <p className="text-xs text-muted">
            Creates the student record, a guardian, portal logins for both and
            the enrolment — in one transaction. Nothing is created if any step
            fails.
          </p>

          <div className="border-t border-border pt-4" />
        </>
      ) : null}

      {allowedNext.length === 0 ? (
        <p className="text-sm text-muted">
          {STATUS_LABEL[currentStatus]} is a final state — no further moves are
          available.
        </p>
      ) : (
        <>
          <Field label="Move to stage">
            <Select
              value={target}
              onChange={(event) => setTarget(event.target.value as ApplicationStatus)}
            >
              {allowedNext.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Note"
            hint={
              target === "REJECTED"
                ? "Saved as the rejection reason and included in the email."
                : "Recorded on the application timeline."
            }
          >
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
            />
          </Field>

          <Button
            variant={target === "REJECTED" ? "danger" : "primary"}
            className="w-full"
            disabled={pending || !target}
            onClick={move}
          >
            {pending ? "Working…" : `Move to ${target ? STATUS_LABEL[target] : "…"}`}
          </Button>

          {target === "OFFERED" || target === "REJECTED" ? (
            <p className="text-xs text-muted">
              The guardian is emailed automatically when an offer or rejection
              is recorded.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
