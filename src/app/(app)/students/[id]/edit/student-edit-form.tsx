"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  editStudent,
  promoteStudent,
  type EditStudentState,
} from "@/app/(app)/students/[id]/edit/actions";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

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

  aadhaarNumber: string;
  apaarId: string;
  penNumber: string;
  udiseNumber: string;
  boardRegNoIX: string;
  boardRegNoXI: string;

  caste: string;
  disabilityType: string;

  placeOfBirth: string;
  languageAtHome: string;
  house: string;
  admissionFileNo: string;
  previousTcNumber: string;
  previousTcDate: string;
  previousBoard: string;

  heightCm: string;
  weightKg: string;
  allergies: string;
  chronicAilment: string;
}

/** Boolean columns, kept apart from the string defaults above. */
export interface StudentFlagDefaults {
  isMinority: boolean;
  isBpl: boolean;
  isEws: boolean;
  isRteQuota: boolean;
  isSingleParent: boolean;
  isSingleChild: boolean;
  isStaffWard: boolean;
  isAlumniChild: boolean;
  hasDisability: boolean;
  hasSpecialNeeds: boolean;
}

const WELFARE_FLAGS: {
  name: keyof StudentFlagDefaults;
  label: string;
  hint?: string;
}[] = [
  { name: "isRteQuota", label: "RTE quota admission" },
  { name: "isEws", label: "Economically weaker section (EWS)" },
  { name: "isBpl", label: "Below poverty line (BPL)" },
  { name: "isMinority", label: "Minority community" },
  { name: "isSingleParent", label: "Single parent" },
  { name: "isSingleChild", label: "Single child" },
  {
    name: "isStaffWard",
    label: "Ward of a staff member",
    hint: "Usually carries a concession",
  },
  { name: "isAlumniChild", label: "Parent is an alumnus" },
];

function CheckboxRow({
  name,
  label,
  hint,
  defaultChecked,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 py-1.5 text-sm">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
      />
      <span className="min-w-0">
        {label}
        {hint ? (
          <span className="block text-[11px] text-muted">{hint}</span>
        ) : null}
      </span>
    </label>
  );
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
  flags,
  currentClass,
  sections,
}: {
  student: StudentDefaults;
  flags: StudentFlagDefaults;
  currentClass: string | null;
  sections: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<EditStudentState, FormData>(
    editStudent,
    {
      ok: false,
      message: "",
    },
  );
  const [promoteState, promoteAction] = useActionState<
    EditStudentState,
    FormData
  >(promoteStudent, { ok: false, message: "" });

  const [hasDisability, setHasDisability] = useState(flags.hasDisability);

  const errors = state.fieldErrors ?? {};
  const v = (name: keyof StudentDefaults) =>
    state.values?.[name] ?? student[name];

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
              <Input
                type="date"
                name="dateOfBirth"
                defaultValue={v("dateOfBirth")}
              />
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
            <Field
              label="Status"
              required
              hint="Moving out of Active stamps an exit date."
            >
              <Select name="status" defaultValue={v("status")} required>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
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
              <Textarea
                name="medicalNotes"
                defaultValue={v("medicalNotes")}
                rows={2}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Statutory identifiers"
            description="Required for UDISE+ returns, APAAR enrolment and board registration"
          />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Aadhaar number" error={errors.aadhaarNumber}>
              <Input
                name="aadhaarNumber"
                defaultValue={v("aadhaarNumber")}
                inputMode="numeric"
              />
            </Field>
            <Field
              label="APAAR ID"
              hint="The national “One Nation One Student ID”."
            >
              <Input name="apaarId" defaultValue={v("apaarId")} />
            </Field>
            <Field label="PEN" hint="Permanent Education Number.">
              <Input name="penNumber" defaultValue={v("penNumber")} />
            </Field>
            <Field
              label="UDISE number"
              hint="The student's own, not the school code."
            >
              <Input name="udiseNumber" defaultValue={v("udiseNumber")} />
            </Field>
            <Field label="Board reg. no. (IX)">
              <Input name="boardRegNoIX" defaultValue={v("boardRegNoIX")} />
            </Field>
            <Field label="Board reg. no. (XI)">
              <Input name="boardRegNoXI" defaultValue={v("boardRegNoXI")} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Equity & welfare"
            description="Drives statutory returns and concession eligibility"
          />
          <div className="grid gap-x-6 px-5 pb-2 sm:grid-cols-2">
            {WELFARE_FLAGS.map((flag) => (
              <CheckboxRow
                key={flag.name}
                name={flag.name}
                label={flag.label}
                hint={flag.hint}
                defaultChecked={flags[flag.name]}
              />
            ))}
          </div>
          <div className="border-t border-border px-5 py-4">
            <CheckboxRow
              name="hasDisability"
              label="Child with special needs (CWSN)"
              hint="Counted in the UDISE+ CWSN return."
              defaultChecked={flags.hasDisability}
              onChange={setHasDisability}
            />
            {/* Only asked once the flag is set — an orphan description would
                otherwise sit on a student who is not reported as CWSN. */}
            {hasDisability ? (
              <div className="mt-2 pl-6">
                <Field label="Nature of disability">
                  <Input
                    name="disabilityType"
                    defaultValue={v("disabilityType")}
                  />
                </Field>
              </div>
            ) : null}
            <CheckboxRow
              name="hasSpecialNeeds"
              label="Specific learning difficulty (dyslexia and similar)"
              hint="Tracked separately — exam boards grant different concessions."
              defaultChecked={flags.hasSpecialNeeds}
            />
          </div>
          <div className="border-t border-border px-5 py-4">
            <Field label="Caste">
              <Input name="caste" defaultValue={v("caste")} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Admission & previous school"
            description="Carried in from the transfer certificate"
          />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Place of birth">
              <Input name="placeOfBirth" defaultValue={v("placeOfBirth")} />
            </Field>
            <Field label="Language at home">
              <Input name="languageAtHome" defaultValue={v("languageAtHome")} />
            </Field>
            <Field label="House" hint="For intra-school competition.">
              <Input name="house" defaultValue={v("house")} />
            </Field>
            <Field label="Admission file no.">
              <Input
                name="admissionFileNo"
                defaultValue={v("admissionFileNo")}
              />
            </Field>
            <Field label="Previous TC number">
              <Input
                name="previousTcNumber"
                defaultValue={v("previousTcNumber")}
              />
            </Field>
            <Field label="Previous TC date">
              <Input
                name="previousTcDate"
                type="date"
                defaultValue={v("previousTcDate")}
              />
            </Field>
            <Field label="Previous board">
              <Input name="previousBoard" defaultValue={v("previousBoard")} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Medical" />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Height (cm)" error={errors.heightCm}>
              <Input
                name="heightCm"
                inputMode="numeric"
                defaultValue={v("heightCm")}
              />
            </Field>
            <Field label="Weight (kg)" error={errors.weightKg}>
              <Input
                name="weightKg"
                inputMode="decimal"
                defaultValue={v("weightKg")}
              />
            </Field>
            <Field label="Allergies">
              <Input name="allergies" defaultValue={v("allergies")} />
            </Field>
            <Field label="Chronic ailment">
              <Input name="chronicAilment" defaultValue={v("chronicAilment")} />
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
            <Alert tone={promoteState.ok ? "success" : "danger"}>
              {promoteState.message}
            </Alert>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Move into class" required>
              <Select name="sectionId" required defaultValue="">
                <option value="">Choose…</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
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
