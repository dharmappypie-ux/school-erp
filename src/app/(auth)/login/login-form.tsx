"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type LoginState } from "@/app/(auth)/login/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Email" required error={state.fieldErrors?.email}>
        <Input
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="you@school.edu.in"
        />
      </Field>

      <Field label="Password" required error={state.fieldErrors?.password}>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </Field>

      <SubmitButton />

      <p className="pt-2 text-center text-xs text-muted">
        Forgotten your password? Ask your school administrator to reset it.
      </p>
    </form>
  );
}
