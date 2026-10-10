"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addApplicationSibling,
  removeApplicationSibling,
  type ApplicationSiblingState,
} from "@/app/(app)/admissions/[id]/sibling-actions";
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
} from "@/components/ui";
import { formatDateOnly } from "@/lib/format";

export interface ApplicationSiblingRow {
  id: string;
  name: string;
  relation: "BROTHER" | "SISTER" | "OTHER";
  /** `yyyy-mm-dd`, empty when the family did not give one. */
  dateOfBirth: string;
  schoolName: string;
}

const RELATION_LABEL: Record<ApplicationSiblingRow["relation"], string> = {
  BROTHER: "Brother",
  SISTER: "Sister",
  OTHER: "Sibling",
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Add sibling"}
    </Button>
  );
}

export function ApplicationSiblings({
  applicationId,
  siblings,
  canManage,
  enrolled,
}: {
  applicationId: string;
  siblings: ApplicationSiblingRow[];
  canManage: boolean;
  /** Once enrolled the rows belong to the student record, not to this page. */
  enrolled: boolean;
}) {
  const [state, formAction] = useActionState<ApplicationSiblingState, FormData>(
    addApplicationSibling,
    { ok: false, message: "" },
  );

  const errors = state.fieldErrors ?? {};
  const today = new Date().toISOString().slice(0, 10);

  // React clears a form's fields on every submission, success or not, so a
  // rejected one is put back from what the server echoed rather than lost.
  const prior = state.values ?? {};

  return (
    <Card>
      <CardHeader
        title="Siblings"
        description={
          enrolled
            ? "Carried over to the student record at enrolment."
            : "Brothers and sisters as the family gave them. They move to the student record at enrolment."
        }
      />

      {siblings.length === 0 ? (
        <EmptyState
          title="No siblings recorded"
          description="Sibling concessions and class placement both lean on this, so it is worth asking."
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
                    sibling.schoolName,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "no other details"}
                </p>
              </div>

              {canManage && !enrolled ? (
                <form action={removeApplicationSibling} className="shrink-0">
                  <input type="hidden" name="id" value={sibling.id} />
                  <input
                    type="hidden"
                    name="applicationId"
                    value={applicationId}
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Remove
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage && !enrolled ? (
        <form
          action={formAction}
          className="space-y-3 border-t border-border px-5 py-5"
        >
          <input type="hidden" name="applicationId" value={applicationId} />

          {state.message ? (
            <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required error={errors.name}>
              <Input
                name="name"
                defaultValue={prior.name ?? ""}
                required
                maxLength={120}
                placeholder="Aarav Sharma"
              />
            </Field>

            <Field label="Relation" required error={errors.relation}>
              <Select
                name="relation"
                defaultValue={prior.relation ?? "OTHER"}
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
                defaultValue={prior.dateOfBirth ?? ""}
              />
            </Field>

            <Field label="Studies at" error={errors.schoolName}>
              <Input
                name="schoolName"
                defaultValue={prior.schoolName ?? ""}
                maxLength={160}
                placeholder="St. Xavier's, Jaipur"
              />
            </Field>
          </div>

          <Submit />
        </form>
      ) : null}
    </Card>
  );
}
