"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  addSibling,
  removeSibling,
  updateSibling,
  type SiblingState,
} from "@/app/(app)/students/[id]/siblings/actions";
import {
  StudentPicker,
  type StudentPickerOption,
} from "@/components/student-picker";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { formatDateOnly } from "@/lib/format";

export interface SiblingRow {
  id: string;
  name: string;
  relation: "BROTHER" | "SISTER" | "OTHER";
  /** `yyyy-mm-dd`, empty when the family did not give one. */
  dateOfBirth: string;
  schoolName: string;
  notes: string;
  linkedStudent: { id: string; name: string; admissionNo: string } | null;
}

const RELATION_LABEL: Record<SiblingRow["relation"], string> = {
  BROTHER: "Brother",
  SISTER: "Sister",
  OTHER: "Sibling",
};

/** Where the sibling studies — the two answers are mutually exclusive. */
type Place = "elsewhere" | "roll";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function SiblingPanel({
  studentId,
  siblings,
  students,
}: {
  studentId: string;
  siblings: SiblingRow[];
  students: StudentPickerOption[];
}) {
  const [editing, setEditing] = useState<SiblingRow | null>(null);
  // Bumped after a save so the form remounts empty: React clears the DOM
  // fields itself, but the student picker holds its own selection until it is
  // remounted, and it would otherwise still name the sibling just filed.
  const [generation, setGeneration] = useState(0);

  // One form serves both jobs; the hidden `id` is what tells them apart, so
  // the two actions cannot disagree about what the fields mean.
  const [state, formAction] = useActionState<SiblingState, FormData>(
    async (previous, formData) => {
      const result = formData.get("id")
        ? await updateSibling(previous, formData)
        : await addSibling(previous, formData);
      // Here rather than in an effect: this runs exactly once per submission,
      // after the server has confirmed it.
      if (result.ok) {
        setEditing(null);
        setGeneration((value) => value + 1);
      }
      return result;
    },
    { ok: false, message: "" },
  );

  return (
    <Card>
      <CardHeader
        title="Siblings"
        description="Brothers and sisters as the family gave them. Linking one who is already on this roll keeps the two records together."
      />

      {siblings.length === 0 ? (
        <EmptyState
          title="No siblings recorded"
          description="Add them below — sibling concessions and class placement both lean on this."
        />
      ) : (
        <ul className="divide-y divide-border">
          {siblings.map((sibling) => (
            <li
              key={sibling.id}
              className="flex items-start justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {sibling.name}
                  <Badge>{RELATION_LABEL[sibling.relation]}</Badge>
                </p>

                <p className="mt-0.5 text-[11px] text-muted">
                  {[
                    sibling.dateOfBirth
                      ? `born ${formatDateOnly(sibling.dateOfBirth)}`
                      : "",
                    sibling.linkedStudent ? "" : sibling.schoolName,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "no other details"}
                </p>

                {sibling.linkedStudent ? (
                  <p className="mt-0.5 text-[11px]">
                    <Link
                      href={`/students/${sibling.linkedStudent.id}`}
                      className="font-medium text-brand underline-offset-2 hover:underline"
                    >
                      On this roll · {sibling.linkedStudent.admissionNo}
                    </Link>
                  </p>
                ) : null}

                {sibling.notes ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-strong">
                    {sibling.notes}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(sibling)}
                >
                  Edit
                </Button>
                {/* Its own form, a sibling of the add form below — never nested. */}
                <form action={removeSibling}>
                  <input type="hidden" name="id" value={sibling.id} />
                  <input type="hidden" name="studentId" value={studentId} />
                  <Button type="submit" variant="secondary" size="sm">
                    Remove
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border">
        <SiblingForm
          key={`${editing?.id ?? "new"}-${generation}`}
          studentId={studentId}
          students={students}
          row={editing}
          state={state}
          formAction={formAction}
          onCancel={() => setEditing(null)}
        />
      </div>
    </Card>
  );
}

function SiblingForm({
  studentId,
  students,
  row,
  state,
  formAction,
  onCancel,
}: {
  studentId: string;
  students: StudentPickerOption[];
  row: SiblingRow | null;
  state: SiblingState;
  formAction: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [place, setPlace] = useState<Place>(
    row?.linkedStudent ? "roll" : "elsewhere",
  );

  const errors = state.fieldErrors ?? {};
  const today = new Date().toISOString().slice(0, 10);

  // React resets a form's fields on every submission, so a rejected one is put
  // back from what the server echoed rather than lost. Only when that echo came
  // from this same target, though — otherwise opening a row to edit just after
  // a failed add would show the failed add's text instead of the row.
  const prior: Record<string, string> =
    state.values && (state.values.id ?? "") === (row?.id ?? "")
      ? state.values
      : {};

  return (
    <form action={formAction} className="space-y-3 px-5 py-5">
      <input type="hidden" name="studentId" value={studentId} />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" required error={errors.name}>
          <Input
            name="name"
            defaultValue={prior.name ?? row?.name ?? ""}
            required
            maxLength={120}
            placeholder="Aarav Sharma"
          />
        </Field>

        <Field label="Relation" required error={errors.relation}>
          <Select
            name="relation"
            defaultValue={prior.relation ?? row?.relation ?? "OTHER"}
            required
          >
            <option value="BROTHER">Brother</option>
            <option value="SISTER">Sister</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>

        <Field
          label="Date of birth"
          error={errors.dateOfBirth}
          hint="Leave blank if the family did not say"
        >
          <Input
            name="dateOfBirth"
            type="date"
            max={today}
            defaultValue={prior.dateOfBirth ?? row?.dateOfBirth ?? ""}
          />
        </Field>
      </div>

      <Field label="Where this sibling studies">
        <Select
          value={place}
          onChange={(event) => setPlace(event.target.value as Place)}
        >
          <option value="elsewhere">Another school, or not at school</option>
          <option value="roll">On this school&apos;s roll</option>
        </Select>
      </Field>

      <input type="hidden" name="place" value={place} />

      {place === "roll" ? (
        <Field
          label="Which student"
          error={errors.siblingStudentId}
          hint="Searches the whole roll; admission number and father tell two of the same name apart."
        >
          <StudentPicker
            students={students}
            name="siblingStudentId"
            required
            defaultValue={row?.linkedStudent?.id ?? ""}
          />
        </Field>
      ) : (
        <Field label="Studies at" error={errors.schoolName}>
          <Input
            name="schoolName"
            defaultValue={prior.schoolName ?? row?.schoolName ?? ""}
            maxLength={160}
            placeholder="St. Xavier's, Jaipur"
          />
        </Field>
      )}

      <Field label="Notes" error={errors.notes}>
        <Textarea
          name="notes"
          rows={2}
          defaultValue={prior.notes ?? row?.notes ?? ""}
          maxLength={500}
          placeholder="Anything the office should know — twins, same section, and so on."
        />
      </Field>

      <div className="flex items-center gap-3">
        <Submit label={row ? "Save sibling" : "Add sibling"} />
        {row ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-muted hover:text-foreground"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
