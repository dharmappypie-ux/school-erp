"use client";

import { useState, useTransition } from "react";

import { createAcademicYear, setCurrentYear } from "@/app/(app)/settings/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";
import { Button } from "@/components/ui";

export function AddAcademicYear() {
  return (
    <DrawerForm
      trigger="Add academic year"
      title="Add an academic year"
      description="The session that fees, exams and enrolment are scoped to"
    >
      <ManageForm
        bare
        title="Add an academic year"
        action={createAcademicYear}
        submitLabel="Create year"
        footnote="Only one year is current at a time. The first year you create becomes current automatically."
        fields={[
          { name: "name", label: "Name", required: true, placeholder: "2026-27" },
          { name: "startDate", label: "Starts", type: "date", required: true, half: true },
          { name: "endDate", label: "Ends", type: "date", required: true, half: true },
          {
            name: "makeCurrent",
            label: "Set as current?",
            type: "select",
            defaultValue: "no",
            options: [
              { value: "no", label: "No — just add it" },
              { value: "yes", label: "Yes — make it the current year" },
            ],
          },
        ]}
      />
    </DrawerForm>
  );
}

export function MakeCurrentButton({ yearId }: { yearId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-end gap-0.5">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setCurrentYear(yearId);
            setError(result.ok ? null : result.message);
          })
        }
      >
        {pending ? "Switching…" : "Make current"}
      </Button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}
