"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  changePassword,
  type ChangePasswordState,
} from "@/app/(auth)/change-password/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Set new password"}
    </Button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<ChangePasswordState, FormData>(
    changePassword,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Current password" required error={errors.currentPassword}>
        <Input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          placeholder="••••••••"
        />
      </Field>

      <Field
        label="New password"
        required
        hint="At least 10 characters."
        error={errors.newPassword}
      >
        <Input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
        />
      </Field>

      <Field label="Confirm new password" required error={errors.confirmPassword}>
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
        />
      </Field>

      <Submit />

      <p className="pt-2 text-center text-xs text-muted">
        You will be signed in again with the new password.
      </p>
    </form>
  );
}
