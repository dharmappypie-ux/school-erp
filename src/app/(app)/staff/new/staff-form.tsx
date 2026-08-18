"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createStaff, type CreateStaffState } from "@/app/(app)/staff/new/actions";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
} from "@/components/ui";

const STAFF_TYPES = [
  { value: "TEACHING", label: "Teaching" },
  { value: "NON_TEACHING", label: "Non-teaching" },
  { value: "ADMINISTRATIVE", label: "Administrative" },
  { value: "SUPPORT", label: "Support" },
  { value: "MANAGEMENT", label: "Management" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create staff member"}
    </Button>
  );
}

export function StaffForm({
  departments,
  designations,
  roles,
}: {
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  roles: { key: string; name: string }[];
}) {
  const [state, formAction] = useActionState<CreateStaffState, FormData>(
    createStaff,
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
        <CardHeader title="Personal details" />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First name" required error={errors.firstName}>
            <Input defaultValue={keep("firstName")} name="firstName" required autoFocus />
          </Field>
          <Field label="Last name">
            <Input defaultValue={keep("lastName")} name="lastName" />
          </Field>
          <Field
            label="Email"
            required
            error={errors.email}
            hint="Becomes the sign-in address."
          >
            <Input defaultValue={keep("email")} name="email" type="email" required />
          </Field>

          <Field label="Phone">
            <Input defaultValue={keep("phone")} name="phone" type="tel" />
          </Field>
          <Field label="Date of birth">
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
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Employment"
          description="The system role decides what this person can open."
        />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Employee ID"
            hint="Generated automatically if left blank."
            error={errors.employeeId}
          >
            <Input defaultValue={keep("employeeId")} name="employeeId" placeholder="EMP0001" />
          </Field>
          <Field label="Staff type" required>
            <Select name="staffType" required defaultValue={keep("staffType", "TEACHING")}>
              {STAFF_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="System role" required error={errors.roleKey}>
            <Select name="roleKey" required defaultValue={keep("roleKey", "TEACHER")}>
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Department">
            <Select name="departmentId" defaultValue={keep("departmentId", "")}>
              <option value="">Not assigned</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Designation">
            <Select name="designationId" defaultValue={keep("designationId", "")}>
              <option value="">Not assigned</option>
              {designations.map((designation) => (
                <option key={designation.id} value={designation.id}>
                  {designation.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Joining date" hint="Defaults to today.">
            <Input defaultValue={keep("joiningDate")} name="joiningDate" type="date" />
          </Field>

          <Field label="Qualification">
            <Input defaultValue={keep("qualification")} name="qualification" placeholder="M.Sc, B.Ed" />
          </Field>
          <Field label="Experience (years)">
            <Input defaultValue={keep("experience")} name="experience" type="number" min="0" max="60" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Submit />
        <Link
          href="/staff"
          className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
        >
          Cancel
        </Link>
        <p className="ml-2 text-xs text-muted">
          A login is created with a temporary password they must change on first
          sign-in.
        </p>
      </div>
    </form>
  );
}
