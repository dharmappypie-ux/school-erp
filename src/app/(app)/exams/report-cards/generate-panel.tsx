"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { generateCards, publishCards } from "@/app/(app)/exams/actions";
import { Alert, Button, Field, Select } from "@/components/ui";

export function GeneratePanel({
  terms,
  sections,
  defaultTermId,
  defaultSectionId,
  canPublish,
}: {
  terms: { id: string; name: string }[];
  sections: { id: string; label: string }[];
  defaultTermId: string;
  defaultSectionId: string;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [termId, setTermId] = useState(defaultTermId);
  const [sectionId, setSectionId] = useState(defaultSectionId);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: "generate" | "publish") {
    startTransition(async () => {
      const response =
        action === "generate"
          ? await generateCards({ termId, sectionId })
          : await publishCards({ termId, sectionId });
      setResult(response);
      if (response.ok) {
        // Reflect the new cards in the list beside this panel.
        router.replace(`/exams/report-cards?term=${termId}&section=${sectionId}`);
      }
    });
  }

  return (
    <div className="space-y-4 px-5 py-5">
      {result ? (
        <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>
      ) : null}

      <Field label="Term" required>
        <Select value={termId} onChange={(event) => setTermId(event.target.value)}>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Class" required>
        <Select
          value={sectionId}
          onChange={(event) => setSectionId(event.target.value)}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="space-y-2">
        <Button
          className="w-full"
          disabled={pending || !termId || !sectionId}
          onClick={() => run("generate")}
        >
          {pending ? "Working…" : "Generate report cards"}
        </Button>

        {canPublish ? (
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending || !termId || !sectionId}
            onClick={() => run("publish")}
          >
            Publish to parents
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted">
        Generating recomputes totals, grades and class rank from the marks on
        record. Cards that are already published are left untouched — publish a
        second time only after regenerating unpublished ones.
      </p>
    </div>
  );
}
