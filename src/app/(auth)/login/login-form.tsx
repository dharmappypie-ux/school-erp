"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type LoginState } from "@/app/(auth)/login/actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({
  schools,
}: {
  schools: { slug: string; name: string }[];
}) {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {schools.length > 1 ? (
        <Field label="School" hint="Leave blank if your email is unique.">
          <Select name="school" defaultValue="">
            <option value="">Detect automatically</option>
            {schools.map((school) => (
              <option key={school.slug} value={school.slug}>
                {school.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

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
