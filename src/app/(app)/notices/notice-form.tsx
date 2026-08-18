"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  createNotice,
  updateNotice,
  type NoticeState,
} from "@/app/(app)/notices/actions";
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

const AUDIENCES = [
  { value: "ALL", label: "Everyone" },
  { value: "PARENTS", label: "Parents" },
  { value: "STUDENTS", label: "Students" },
  { value: "STAFF", label: "Staff" },
];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="publishNow" value="true" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function DraftButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      Save as draft
    </Button>
  );
}

export function NoticeForm({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<NoticeState, FormData>(createNotice, {
    ok: false,
    message: "",
  });
  const [audience, setAudience] = useState<string[]>(["ALL"]);

  const errors = state.fieldErrors ?? {};
  const prior = state.values ?? {};

  function toggle(value: string) {
    setAudience((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  }

  return (
    <form action={formAction} className="space-y-4 px-5 py-5">
      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <input type="hidden" name="audience" value={audience.join(",")} />

      <Field label="Title" required error={errors.title}>
        <Input
          name="title"
          defaultValue={prior.title ?? ""}
          required
          placeholder="Parent–teacher meeting on Saturday"
        />
      </Field>

      <Field label="Notice" required error={errors.body}>
        <Textarea
          name="body"
          defaultValue={prior.body ?? ""}
          rows={5}
          required
          placeholder="The PTM for all classes is scheduled this Saturday from 9:00 AM."
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted-strong">
          Audience <span className="text-danger">*</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {AUDIENCES.map((entry) => {
            const active = audience.includes(entry.value);
            return (
              <button
                key={entry.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(entry.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border-strong text-muted hover:bg-surface-hover"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
        {errors.audience ? (
          <span className="mt-1 block text-xs text-danger">{errors.audience}</span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Limit to one class" hint="Leave blank for the whole school.">
          <Select name="sectionId" defaultValue={prior.sectionId ?? ""}>
            <option value="">Whole school</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Expires on" hint="Optional — hides the notice after this date.">
          <Input name="expiresAt" type="date" defaultValue={prior.expiresAt ?? ""} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPinned"
          defaultChecked={prior.isPinned === "on"}
          className="h-4 w-4 accent-[var(--brand)]"
        />
        Pin to the top of the notice board
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Submit label="Publish notice" />
        <DraftButton />
      </div>

      <p className="text-xs text-muted">
        A published notice appears immediately for the chosen audience and
        cannot be unsent — only withdrawn. Save as a draft to revise it first.
      </p>
    </form>
  );
}

/** Publish, withdraw and pin controls on an existing notice. */
export function NoticeActions({
  noticeId,
  isPublished,
  isPinned,
}: {
  noticeId: string;
  isPublished: boolean;
  isPinned: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: "PUBLISH" | "UNPUBLISH" | "PIN" | "UNPIN") {
    startTransition(async () => {
      const result = await updateNotice({ noticeId, action });
      setError(result.ok ? null : result.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(isPinned ? "UNPIN" : "PIN")}
        >
          {isPinned ? "Unpin" : "Pin"}
        </Button>
        <Button
          size="sm"
          variant={isPublished ? "secondary" : "primary"}
          disabled={pending}
          onClick={() => run(isPublished ? "UNPUBLISH" : "PUBLISH")}
        >
          {isPublished ? "Withdraw" : "Publish"}
        </Button>
      </div>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
