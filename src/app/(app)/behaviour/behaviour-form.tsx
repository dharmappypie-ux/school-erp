"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createBehaviourLog,
  type BehaviourState,
} from "@/app/(app)/behaviour/actions";
import {
  StudentPicker,
  type StudentPickerOption,
} from "@/components/student-picker";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

/**
 * A fixed list plus "Other", rather than a free-text datalist: the native
 * datalist popup is drawn by the browser, not the stylesheet, so it lands in
 * the wrong place in the wrong type. Schools that name these differently use
 * Other and type their own.
 */
const CATEGORIES = [
  "Discipline",
  "Homework",
  "Punctuality",
  "Uniform",
  "Helpfulness",
  "Academic effort",
  "Sport",
  "Peer conflict",
];

/** Sentinel for the free-text escape hatch; never stored. */
const OTHER = "__other__";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Record note"}
    </Button>
  );
}

export function BehaviourForm({
  students,
  bare = false,
}: {
  students: StudentPickerOption[];
  bare?: boolean;
}) {
  const [state, formAction] = useActionState<BehaviourState, FormData>(
    createBehaviourLog,
    { ok: false, message: "" },
  );
  const [kind, setKind] = useState("APPRECIATION");
  const [category, setCategory] = useState("");

  const errors = state.fieldErrors ?? {};
  const prior = state.values ?? {};
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className={bare ? "space-y-4" : "space-y-4 p-5"}>
      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Field label="Student" required error={errors.studentId}>
        <StudentPicker
          students={students}
          required
          defaultValue={prior.studentId ?? ""}
        />
      </Field>

      <Field label="Kind" required error={errors.kind}>
        <Select
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          required
        >
          <option value="APPRECIATION">
            Appreciation — something done well
          </option>
          <option value="CONCERN">Concern — something to address</option>
          <option value="NEUTRAL">Neutral — a record of what happened</option>
        </Select>
      </Field>

      {/* Severity only applies to a concern; see the note in actions.ts. */}
      {kind === "CONCERN" ? (
        <Field label="Severity" error={errors.severity}>
          <Select name="severity" defaultValue={prior.severity ?? "LOW"}>
            <option value="LOW">Low — mention it</option>
            <option value="MEDIUM">Medium — tell the guardian</option>
            <option value="HIGH">High — needs a meeting</option>
          </Select>
        </Field>
      ) : null}

      <Field label="Category" error={errors.category}>
        <Select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          // Named only when it carries the value; "Other" hands the name to the
          // text input below so the action still receives one `category`.
          name={category === OTHER ? undefined : "category"}
        >
          <option value="">No category</option>
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </Select>
      </Field>

      {category === OTHER ? (
        <Field label="Category name" error={errors.category}>
          <Input
            name="category"
            defaultValue=""
            maxLength={60}
            placeholder="Name it as your school does"
            autoFocus
          />
        </Field>
      ) : null}

      <Field label="Summary" required error={errors.summary}>
        <Input
          name="summary"
          defaultValue={prior.summary ?? ""}
          required
          maxLength={200}
          placeholder="Helped a new classmate settle in"
        />
      </Field>

      <Field label="Detail" error={errors.detail}>
        <Textarea
          name="detail"
          rows={3}
          defaultValue={prior.detail ?? ""}
          maxLength={2000}
          placeholder="Anything the guardian or next teacher should know."
        />
      </Field>

      <Field label="Date" required error={errors.occurredOn}>
        <Input
          name="occurredOn"
          type="date"
          max={today}
          defaultValue={prior.occurredOn ?? today}
          required
        />
      </Field>

      <div className="flex justify-end pt-1">
        <Submit />
      </div>
    </form>
  );
}
