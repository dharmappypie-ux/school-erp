"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { collectPayment, type CollectResult } from "@/app/(app)/fees/actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

const MODES = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "NETBANKING", label: "Net banking" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "DEMAND_DRAFT", label: "Demand draft" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "ADJUSTMENT", label: "Adjustment" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Recording…" : "Record payment"}
    </Button>
  );
}

export function CollectForm({
  students,
}: {
  students: { id: string; label: string; due: string }[];
}) {
  const [state, formAction] = useActionState<CollectResult, FormData>(
    collectPayment,
    { ok: false, message: "" },
  );

  return (
    <form action={formAction} className="space-y-4 px-5 py-5">
      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Field
        label="Student"
        required
        hint="Only students with an outstanding balance are listed."
      >
        <Select name="studentId" required defaultValue="">
          <option value="" disabled>
            Select a student…
          </option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.label} — {student.due} due
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required>
          <Input
            name="amount"
            type="number"
            min="1"
            step="0.01"
            required
            placeholder="0.00"
            className="numeric"
          />
        </Field>
        <Field label="Mode" required>
          <Select name="mode" required defaultValue="CASH">
            {MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Reference" hint="Cheque number, UPI reference or transaction id.">
        <Input name="reference" placeholder="Optional" />
      </Field>

      <Field label="Remarks">
        <Input name="remarks" placeholder="Optional" />
      </Field>

      <p className="text-xs text-muted">
        The amount is applied to the oldest unpaid invoice first, then carried
        forward to the next.
      </p>

      <Submit />
    </form>
  );
}
