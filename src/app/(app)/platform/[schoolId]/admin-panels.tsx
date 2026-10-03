"use client";

import { useState, useTransition } from "react";

import {
  addSchoolAdmin,
  resetSchoolAdminPassword,
  setSchoolAdminRole,
  setSchoolAdminStatus,
} from "@/app/(app)/platform/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";
import { SlideOver } from "@/components/slide-over";
import { Alert, Button, Field, Select } from "@/components/ui";

const ADMIN_ROLES = [
  { value: "SUPER_ADMIN", label: "Super Administrator" },
  { value: "ADMIN", label: "Administrator" },
];

export function AddSchoolAdmin({ schoolId }: { schoolId: string }) {
  return (
    <DrawerForm
      trigger="Add admin"
      title="Add an administrator"
      description="Creates a login and a one-time password to share"
    >
      <ManageForm
        bare
        title="Add an administrator"
        action={addSchoolAdmin}
        submitLabel="Create admin"
        hiddenValues={{ schoolId }}
        footnote="The one-time password is shown once, after saving. They must change it at first sign-in."
        fields={[
          { name: "firstName", label: "First name", required: true, half: true },
          { name: "lastName", label: "Last name", half: true },
          { name: "email", label: "Email (login)", required: true, placeholder: "admin@school.edu.in" },
          { name: "roleKey", label: "Role", type: "select", required: true, options: ADMIN_ROLES, defaultValue: "ADMIN" },
        ]}
      />
    </DrawerForm>
  );
}

export function SchoolAdminActions({
  schoolId,
  userId,
  userName,
  roleKey,
  status,
}: {
  schoolId: string;
  userId: string;
  userName: string;
  roleKey: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [nextRole, setNextRole] = useState(roleKey === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => setResult(await action()));
  }

  const isActive = status === "ACTIVE";

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Manage
      </Button>

      <SlideOver open={open} onClose={() => setOpen(false)} label={`Manage ${userName}`} width="w-[26rem]">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{userName}</h2>
            <p className="mt-0.5 text-xs text-muted">Role, password and access</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-[var(--radius-base)] p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
              <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {result ? <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert> : null}

          <div className="space-y-2">
            <Field label="Role">
              <Select value={nextRole} onChange={(event) => setNextRole(event.target.value)}>
                {ADMIN_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              disabled={pending || nextRole === roleKey}
              onClick={() =>
                run(() => setSchoolAdminRole(schoolId, userId, nextRole as "SUPER_ADMIN" | "ADMIN"))
              }
            >
              {pending ? "Saving…" : "Update role"}
            </Button>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-1.5 text-xs font-medium text-muted-strong">Password</p>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => resetSchoolAdminPassword(schoolId, userId))}
            >
              Reset password
            </Button>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-1.5 text-xs font-medium text-muted-strong">Access</p>
            {isActive ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => setSchoolAdminStatus(schoolId, userId, "SUSPENDED"))}
                >
                  Suspend
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => run(() => setSchoolAdminStatus(schoolId, userId, "INACTIVE"))}
                >
                  Deactivate
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => setSchoolAdminStatus(schoolId, userId, "ACTIVE"))}
              >
                Reactivate
              </Button>
            )}
          </div>
        </div>
      </SlideOver>
    </>
  );
}
