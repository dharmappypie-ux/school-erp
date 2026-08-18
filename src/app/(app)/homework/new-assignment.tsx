"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createAssignment } from "@/app/(app)/homework/actions";
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

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={pending}>
      {pending ? "Setting…" : "Set assignment"}
    </Button>
  );
}

export function NewAssignment({
  sections,
  subjects,
}: {
  sections: { id: string; label: string }[];
  subjects: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createAssignment, null);
  // Failed submissions echo the values back so nothing typed is lost.
  const keep = (name: string) => state?.values?.[name] ?? "";

  return (
    <Card className="h-fit">
      <CardHeader title="Set homework" description="Opens a row for every student in the class" />
      <form action={action} className="space-y-3 px-5 py-5">
        {state ? (
          <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
        ) : null}

        <Field label="Class" required>
          <Select name="sectionId" defaultValue={keep("sectionId")} required>
            <option value="">Choose…</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Subject" required>
          <Select name="subjectId" defaultValue={keep("subjectId")} required>
            <option value="">Choose…</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Title" required>
          <Input name="title" defaultValue={keep("title")} placeholder="Chapter 4 exercises" required />
        </Field>

        <Field label="Instructions">
          <Textarea name="description" defaultValue={keep("description")} rows={3} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due on" required>
            <Input type="date" name="dueOn" defaultValue={keep("dueOn")} required />
          </Field>
          <Field label="Max marks" hint="Leave blank if ungraded.">
            <Input type="number" name="maxMarks" min="1" defaultValue={keep("maxMarks")} className="numeric" />
          </Field>
        </div>

        <Submit />
      </form>
    </Card>
  );
}
