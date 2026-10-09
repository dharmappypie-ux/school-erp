"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createJobPosting, type JobState } from "@/app/(app)/careers/actions";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

const CATEGORIES = [
  "Teaching — PRT",
  "Teaching — TGT",
  "Teaching — PGT",
  "Head of Department",
  "Administration",
  "Accounts",
  "Front Office",
  "Librarian",
  "Lab Assistant",
  "Transport",
  "Housekeeping",
  "Security",
  "Other",
];

function PublishButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="publishNow" value="true" disabled={pending}>
      {pending ? "Saving…" : "Publish"}
    </Button>
  );
}

function DraftButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      Save as draft
    </Button>
  );
}

export function JobForm({ bare = false }: { bare?: boolean }) {
  const [state, formAction] = useActionState<JobState, FormData>(
    createJobPosting,
    { ok: false, message: "" },
  );

  const errors = state.fieldErrors ?? {};
  const prior = state.values ?? {};

  return (
    <form action={formAction} className={bare ? "space-y-4" : "space-y-4 p-5"}>
      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Field label="Post title" required error={errors.title}>
        <Input
          name="title"
          defaultValue={prior.title ?? ""}
          required
          maxLength={160}
          placeholder="PGT Mathematics"
        />
      </Field>

      <Field label="Category" required error={errors.category}>
        <Select name="category" defaultValue={prior.category ?? ""} required>
          <option value="">Select a category</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vacancies" error={errors.vacancies}>
          <Input
            name="vacancies"
            type="number"
            min={1}
            defaultValue={prior.vacancies ?? "1"}
          />
        </Field>

        <Field
          label="Minimum experience"
          hint="Years. Leave blank if freshers may apply."
          error={errors.minExperience}
        >
          <Input
            name="minExperience"
            type="number"
            min={0}
            defaultValue={prior.minExperience ?? ""}
            placeholder="3"
          />
        </Field>
      </div>

      <Field label="Qualification" error={errors.qualification}>
        <Input
          name="qualification"
          defaultValue={prior.qualification ?? ""}
          maxLength={200}
          placeholder="M.Sc. Mathematics with B.Ed."
        />
      </Field>

      <Field label="Description" error={errors.description}>
        <Textarea
          name="description"
          rows={3}
          defaultValue={prior.description ?? ""}
          maxLength={4000}
        />
      </Field>

      <Field label="Key responsibilities" error={errors.responsibilities}>
        <Textarea
          name="responsibilities"
          rows={3}
          defaultValue={prior.responsibilities ?? ""}
          maxLength={4000}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location" error={errors.location}>
          <Input
            name="location"
            defaultValue={prior.location ?? ""}
            maxLength={120}
            placeholder="Main campus"
          />
        </Field>

        <Field label="Salary range" error={errors.salaryRange}>
          <Input
            name="salaryRange"
            defaultValue={prior.salaryRange ?? ""}
            maxLength={80}
            placeholder="₹35,000 – ₹45,000"
          />
        </Field>
      </div>

      <Field
        label="Closing date"
        hint="A published post must close in the future."
        error={errors.closingDate}
      >
        <Input
          name="closingDate"
          type="date"
          defaultValue={prior.closingDate ?? ""}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="cvRequired"
          value="true"
          defaultChecked={prior.cvRequired !== undefined ? prior.cvRequired === "true" : true}
          className="h-4 w-4 rounded border-border"
        />
        Require a CV from applicants
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <DraftButton />
        <PublishButton />
      </div>
    </form>
  );
}
