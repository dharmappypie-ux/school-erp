"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  editStudent,
  promoteStudent,
  type EditStudentState,
} from "@/app/(app)/students/[id]/edit/actions";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";

const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "DROPPED", label: "Dropped" },
  { value: "ALUMNI", label: "Alumni" },
];

export interface StudentDefaults {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  category: string;
  status: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  previousSchool: string;
  medicalNotes: string;
  exitReason: string;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function StudentEditForm({
  student,
  currentClass,
  sections,
}: {
  student: StudentDefaults;
  currentClass: string | null;
  sections: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<EditStudentState, FormData>(editStudent, {
    ok: false,
    message: "",
  });
  const [promoteState, promoteAction] = useActionState<EditStudentState, FormData>(
    promoteStudent,
    { ok: false, message: "" },
  );

  const errors = state.fieldErrors ?? {};
  const v = (name: keyof StudentDefaults) => state.values?.[name] ?? student[name];

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={student.id} />
        {state.message ? (
          <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
        ) : null}

        <Card>
          <CardHeader title="Identity" />
          <div className="grid gap-3 px-5 py-5 sm:grid-cols-3">
            <Field label="First name" required error={errors.firstName}>
              <Input name="firstName" defaultValue={v("firstName")} required />
            </Field>
            <Field label="Middle name">
              <Input name="middleName" defaultValue={v("middleName")} />
            </Field>
            <Field label="Last name">
              <Input name="lastName" defaultValue={v("lastName")} />
            </Field>
            <Field label="Date of birth">
              <Input type="date" name="dateOfBirth" defaultValue={v("dateOfBirth")} />
            </Field>
            <Field label="Gender">
              <Select name="gender" defaultValue={v("gender")}>
                <option value="">—</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Blood group">
              <Input name="bloodGroup" defaultValue={v("bloodGroup")} />
            </Field>
            <Field label="Category">
              <Input name="category" defaultValue={v("category")} />
            </Field>
            <Field label="Status" required hint="Moving out of Active stamps an exit date.">
              <Select name="status" defaultValue={v("status")} required>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Exit reason" hint="Only used when not active.">
              <Input name="exitReason" defaultValue={v("exitReason")} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact & address" />
          <div className="grid gap-3 px-5 py-5 sm:grid-cols-3">
            <Field label="Phone">
              <Input name="phone" defaultValue={v("phone")} />
            </Field>
            <Field label="Email">
              <Input name="email" defaultValue={v("email")} />
            </Field>
            <Field label="Address">
              <Input name="addressLine1" defaultValue={v("addressLine1")} />
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={v("city")} />
            </Field>
            <Field label="State">
              <Input name="state" defaultValue={v("state")} />
            </Field>
            <Field label="Postal code">
              <Input name="postalCode" defaultValue={v("postalCode")} />
            </Field>
            <Field label="Previous school">
              <Input name="previousSchool" defaultValue={v("previousSchool")} />
            </Field>
          </div>
          <div className="px-5 pb-5">
            <Field label="Medical notes">
              <Textarea name="medicalNotes" defaultValue={v("medicalNotes")} rows={2} />
            </Field>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Submit label="Save changes" />
          <Link
            href={`/students/${student.id}`}
            className="text-sm font-medium text-muted hover:text-foreground"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* Promotion is its own form: it closes the current enrolment and opens a
          new one, which is a different operation from editing profile fields
          and must not be swept up in a "save profile" click. */}
      <Card>
        <CardHeader
          title="Move class / promote"
          description={
            currentClass
              ? `Currently in ${currentClass}. Moving keeps the old class in the student's history.`
              : "This student has no active class enrolment."
          }
        />
        <form action={promoteAction} className="space-y-3 px-5 py-5">
          <input type="hidden" name="studentId" value={student.id} />
          {promoteState.message ? (
            <Alert tone={promoteState.ok ? "success" : "danger"}>{promoteState.message}</Alert>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Move into class" required>
              <Select name="sectionId" required defaultValue="">
                <option value="">Choose…</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="New roll number">
              <Input name="rollNumber" placeholder="Optional" />
            </Field>
          </div>
          <Submit label="Move student" />
        </form>
      </Card>
    </div>
  );
}
