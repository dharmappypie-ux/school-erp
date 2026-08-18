"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createStudent,
  type CreateStudentState,
} from "@/app/(app)/students/new/actions";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
} from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create student"}
    </Button>
  );
}

export function StudentForm({
  sections,
}: {
  sections: { id: string; label: string; seatsLeft: number }[];
}) {
  const [state, formAction] = useActionState<CreateStudentState, FormData>(
    createStudent,
    { ok: false, message: "" },
  );

  const errors = state.fieldErrors ?? {};
  // Re-fill from the rejected submission so nothing typed is lost.
  const prior = state.values ?? {};
  const keep = (name: string, fallback = "") => prior[name] ?? fallback;

  return (
    <form action={formAction} className="space-y-4">
      {state.message && !state.ok ? (
        <Alert tone="danger">{state.message}</Alert>
      ) : null}

      <Card>
        <CardHeader title="Student details" />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First name" required error={errors.firstName}>
            <Input defaultValue={keep("firstName")} name="firstName" required autoFocus />
          </Field>
          <Field label="Middle name">
            <Input defaultValue={keep("middleName")} name="middleName" />
          </Field>
          <Field label="Last name">
            <Input defaultValue={keep("lastName")} name="lastName" />
          </Field>

          <Field label="Date of birth" error={errors.dateOfBirth}>
            <Input defaultValue={keep("dateOfBirth")} name="dateOfBirth" type="date" />
          </Field>
          <Field label="Gender">
            <Select name="gender" defaultValue={keep("gender", "")}>
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Blood group">
            <Select name="bloodGroup" defaultValue={keep("bloodGroup", "")}>
              <option value="">Not known</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Class"
            required
            error={errors.sectionId}
            hint="Full classes cannot be selected."
          >
            <Select name="sectionId" required defaultValue={keep("sectionId", "")}>
              <option value="" disabled>
                Select a class…
              </option>
              {sections.map((section) => (
                <option
                  key={section.id}
                  value={section.id}
                  disabled={section.seatsLeft <= 0}
                >
                  {section.label} — {section.seatsLeft} seat
                  {section.seatsLeft === 1 ? "" : "s"} left
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Roll number" hint="Assigned automatically if left blank.">
            <Input defaultValue={keep("rollNumber")} name="rollNumber" />
          </Field>
          <Field label="Category">
            <Select name="category" defaultValue={keep("category", "")}>
              <option value="">Not specified</option>
              {["General", "OBC", "SC", "ST", "EWS"].map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Address">
            <Input defaultValue={keep("addressLine1")} name="addressLine1" />
          </Field>
          <Field label="City">
            <Input defaultValue={keep("city")} name="city" />
          </Field>
          <Field label="State">
            <Input defaultValue={keep("state")} name="state" />
          </Field>
          <Field label="Postal code">
            <Input defaultValue={keep("postalCode")} name="postalCode" />
          </Field>
          <Field label="Previous school">
            <Input defaultValue={keep("previousSchool")} name="previousSchool" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Primary guardian"
          description="Becomes the fee payer and receives the parent portal login."
        />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Guardian name" required error={errors.guardianName}>
            <Input defaultValue={keep("guardianName")} name="guardianName" required />
          </Field>
          <Field label="Phone" required error={errors.guardianPhone}>
            <Input defaultValue={keep("guardianPhone")} name="guardianPhone" type="tel" required />
          </Field>
          <Field
            label="Email"
            error={errors.guardianEmail}
            hint="Used for the portal login if provided."
          >
            <Input defaultValue={keep("guardianEmail")} name="guardianEmail" type="email" />
          </Field>
          <Field label="Relationship">
            <Select name="relationship" defaultValue={keep("relationship", "FATHER")}>
              {["FATHER", "MOTHER", "GRANDPARENT", "UNCLE", "LOCAL_GUARDIAN", "OTHER"].map(
                (relationship) => (
                  <option key={relationship} value={relationship}>
                    {relationship.replace("_", " ").toLowerCase()}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field label="Occupation">
            <Input defaultValue={keep("occupation")} name="occupation" />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Submit />
        <Link
          href="/students"
          className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
        >
          Cancel
        </Link>
        <p className="ml-2 text-xs text-muted">
          An admission number and portal logins for the student and guardian are
          created automatically.
        </p>
      </div>
    </form>
  );
}
