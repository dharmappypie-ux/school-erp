"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  applyStudentLeave,
  type ApplyState,
} from "@/app/(app)/portal/leave/actions";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { PORTION_LABEL } from "@/lib/student-leave";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send request"}
    </Button>
  );
}

export function LeaveForm({ childId }: { childId: string }) {
  const [state, formAction] = useActionState<ApplyState, FormData>(
    applyStudentLeave,
    { ok: false, message: "" },
  );
  const [portion, setPortion] = useState("FULL_DAY");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const errors = state.fieldErrors ?? {};
  const prior = state.values ?? {};
  const singleDay = fromDate !== "" && fromDate === toDate;

  return (
    <form action={formAction} className="space-y-4 px-5 pb-5">
      <input type="hidden" name="child" value={childId} />

      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First day" required error={errors.fromDate}>
          <Input
            name="fromDate"
            type="date"
            required
            value={fromDate || (prior.fromDate ?? "")}
            onChange={(event) => {
              const value = event.target.value;
              setFromDate(value);
              // Most requests are for one day; filling the end date saves a tap
              // and makes the half-day options appear immediately.
              if (toDate === "" || toDate < value) setToDate(value);
            }}
          />
        </Field>

        <Field label="Last day" required error={errors.toDate}>
          <Input
            name="toDate"
            type="date"
            required
            min={fromDate || undefined}
            value={toDate || (prior.toDate ?? "")}
            onChange={(event) => setToDate(event.target.value)}
          />
        </Field>
      </div>

      {/* A half day only means something on a single date; see validateLeave. */}
      {singleDay ? (
        <Field label="How much of the day?" error={errors.portion}>
          <Select
            name="portion"
            value={portion}
            onChange={(event) => setPortion(event.target.value)}
          >
            {Object.entries(PORTION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="portion" value="FULL_DAY" />
      )}

      {singleDay && portion === "FIRST_HALF" ? (
        <Field
          label="Leaving after which period?"
          hint="Optional — helps the class teacher and the gate know when to expect collection."
          error={errors.leavingAfterPeriod}
        >
          <Input
            name="leavingAfterPeriod"
            type="number"
            min={1}
            max={12}
            placeholder="2"
            defaultValue={prior.leavingAfterPeriod ?? ""}
          />
        </Field>
      ) : null}

      <Field label="Reason" required error={errors.reason}>
        <Textarea
          name="reason"
          rows={3}
          required
          maxLength={500}
          defaultValue={prior.reason ?? ""}
          placeholder="Medical appointment, family function, travel…"
        />
      </Field>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
