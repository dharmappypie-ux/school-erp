"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { editStaff, type EditStaffState } from "@/app/(app)/staff/[id]/edit/actions";
import { Alert, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";

const STAFF_TYPES = [
  { value: "TEACHING", label: "Teaching" },
  { value: "NON_TEACHING", label: "Non-teaching" },
  { value: "ADMINISTRATIVE", label: "Administrative" },
  { value: "SUPPORT", label: "Support" },
  { value: "MANAGEMENT", label: "Management" },
];

const EMPLOYMENT_STATUS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PROBATION", label: "Probation" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "RETIRED", label: "Retired" },
];

export interface StaffDefaults {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  staffType: string;
  employmentStatus: string;
  departmentId: string;
  designationId: string;
  roleKey: string;
  qualification: string;
  experience: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;

  fatherOrHusbandName: string;
  maritalStatus: string;
  policeVerificationStatus: string;
  policeVerificationDate: string;
  policeVerificationRef: string;
  drivingLicenceNo: string;
  drivingLicenceExpiry: string;
  oasisId: string;
  teacherNationalCode: string;
}

const MARITAL_STATUSES = [
  { value: "", label: "Not recorded" },
  { value: "MARRIED", label: "Married" },
  { value: "UNMARRIED", label: "Unmarried" },
  { value: "WIDOWED", label: "Widowed" },
  { value: "DIVORCED", label: "Divorced" },
];

const POLICE_STATUSES = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "SUBMITTED", label: "Submitted — awaiting result" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired — needs renewal" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function StaffEditForm({
  staff,
  departments,
  designations,
  roles,
}: {
  staff: StaffDefaults;
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  roles: { key: string; name: string }[];
}) {
  const [state, formAction] = useActionState<EditStaffState, FormData>(editStaff, {
    ok: false,
    message: "",
  });

  const errors = state.fieldErrors ?? {};
  // After a rejected submit, the server echoes the values back; otherwise show
  // what is currently stored.
  const v = (name: keyof StaffDefaults) => state.values?.[name] ?? staff[name];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={staff.id} />

      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Card>
        <CardHeader title="Identity & login" description="Changing the email changes the sign-in address" />
        <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
          <Field label="First name" required error={errors.firstName}>
            <Input name="firstName" defaultValue={v("firstName")} required />
          </Field>
          <Field label="Last name">
            <Input name="lastName" defaultValue={v("lastName")} />
          </Field>
          <Field label="Email" required error={errors.email}>
            <Input type="email" name="email" defaultValue={v("email")} required />
          </Field>
          <Field label="Phone">
            <Input name="phone" defaultValue={v("phone")} />
          </Field>
          <Field label="System role" required error={errors.roleKey} hint="Controls what this person can see and do.">
            <Select name="roleKey" defaultValue={v("roleKey")} required>
              {roles.map((role) => (
                <option key={role.key} value={role.key}>{role.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Employment status" required>
            <Select name="employmentStatus" defaultValue={v("employmentStatus")} required>
              {EMPLOYMENT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Role at the school" />
        <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
          <Field label="Staff type" required>
            <Select name="staffType" defaultValue={v("staffType")} required>
              {STAFF_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Select name="departmentId" defaultValue={v("departmentId")}>
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Designation">
            <Select name="designationId" defaultValue={v("designationId")}>
              <option value="">—</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Qualification">
            <Input name="qualification" defaultValue={v("qualification")} />
          </Field>
          <Field label="Experience (years)">
            <Input type="number" name="experience" min="0" defaultValue={v("experience")} className="numeric" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Personal & address" />
        <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
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
          <Field label="Father's / husband's name">
            <Input name="fatherOrHusbandName" defaultValue={v("fatherOrHusbandName")} />
          </Field>
          <Field label="Marital status">
            <Select name="maritalStatus" defaultValue={v("maritalStatus")}>
              {MARITAL_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Police verification"
          description="A legal precondition for school employment — the first thing an inspection asks for"
        />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Status" required>
            <Select
              name="policeVerificationStatus"
              defaultValue={v("policeVerificationStatus")}
            >
              {POLICE_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date of verification">
            <Input
              name="policeVerificationDate"
              type="date"
              defaultValue={v("policeVerificationDate")}
            />
          </Field>
          <Field label="Reference number" error={errors.policeVerificationRef}>
            <Input
              name="policeVerificationRef"
              defaultValue={v("policeVerificationRef")}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Statutory codes & licence"
          description="Driving licence is mandatory for drivers"
        />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="OASIS ID" hint="CBSE staff code.">
            <Input name="oasisId" defaultValue={v("oasisId")} />
          </Field>
          <Field label="Teacher National Code" hint="NCTE.">
            <Input
              name="teacherNationalCode"
              defaultValue={v("teacherNationalCode")}
            />
          </Field>
          <Field label="Driving licence no." error={errors.drivingLicenceNo}>
            <Input name="drivingLicenceNo" defaultValue={v("drivingLicenceNo")} />
          </Field>
          <Field label="Licence expiry">
            <Input
              name="drivingLicenceExpiry"
              type="date"
              defaultValue={v("drivingLicenceExpiry")}
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Submit />
        <Link
          href={`/staff/${staff.id}`}
          className="text-sm font-medium text-muted hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
