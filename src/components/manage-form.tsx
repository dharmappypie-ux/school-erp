"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

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

export interface FormFieldSpec {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "textarea" | "select";
  required?: boolean;
  hint?: string;
  placeholder?: string;
  min?: string;
  step?: string;
  options?: { value: string; label: string }[];
  /** Value used when the form has not been submitted yet. */
  defaultValue?: string;
  /** Half-width on wider screens, so related pairs sit side by side. */
  half?: boolean;
}

export interface ManageFormResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * A small declarative form for the admin add/edit panels.
 *
 * Written once because the three modules it serves need identical behaviour in
 * the parts that are easy to get wrong: echoing submitted values back so a
 * failed save never wipes what was typed, and showing the server's own message
 * rather than a generic "something went wrong".
 */
export function ManageForm({
  title,
  description,
  fields,
  action,
  submitLabel = "Save",
  hiddenValues,
  footnote,
}: {
  title: string;
  description?: string;
  fields: FormFieldSpec[];
  action: (prev: unknown, formData: FormData) => Promise<ManageFormResult>;
  submitLabel?: string;
  hiddenValues?: Record<string, string>;
  footnote?: string;
}) {
  const [state, formAction] = useActionState(action, null);

  // On failure the server sends the raw values back; prefer those over the
  // defaults so nothing the user typed is lost.
  const valueFor = (field: FormFieldSpec) =>
    state?.values?.[field.name] ?? field.defaultValue ?? "";

  return (
    <Card className="h-fit">
      <CardHeader title={title} description={description} />
      <form action={formAction} className="space-y-3 px-5 py-5">
        {state ? (
          <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
        ) : null}

        {Object.entries(hiddenValues ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name} className={field.half ? "" : "sm:col-span-2"}>
              <Field label={field.label} required={field.required} hint={field.hint}>
                {field.type === "textarea" ? (
                  <Textarea
                    name={field.name}
                    defaultValue={valueFor(field)}
                    placeholder={field.placeholder}
                    rows={2}
                    required={field.required}
                  />
                ) : field.type === "select" ? (
                  <Select
                    name={field.name}
                    defaultValue={valueFor(field)}
                    required={field.required}
                  >
                    <option value="">Choose…</option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    name={field.name}
                    type={field.type ?? "text"}
                    defaultValue={valueFor(field)}
                    placeholder={field.placeholder}
                    min={field.min}
                    step={field.step}
                    required={field.required}
                    className={field.type === "number" ? "numeric" : undefined}
                  />
                )}
              </Field>
            </div>
          ))}
        </div>

        <Submit label={submitLabel} />

        {footnote ? <p className="text-[11px] text-muted">{footnote}</p> : null}
      </form>
    </Card>
  );
}
