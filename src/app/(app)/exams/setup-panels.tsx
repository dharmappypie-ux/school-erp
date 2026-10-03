"use client";

import { createExam, createExamTerm } from "@/app/(app)/exams/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";

export function AddExamTerm() {
  return (
    <DrawerForm
      trigger="Add term"
      title="Add an exam term"
      description="A grading period, e.g. Term 1 or Mid-Year"
    >
      <ManageForm
        bare
        title="Add an exam term"
        action={createExamTerm}
        submitLabel="Create term"
        footnote="Weightage is this term's share of the final result."
        fields={[
          { name: "name", label: "Term name", required: true, placeholder: "Term 1", half: true },
          { name: "sequence", label: "Sequence", type: "number", min: "1", defaultValue: "1", required: true, half: true },
          { name: "startDate", label: "Starts", type: "date", half: true },
          { name: "endDate", label: "Ends", type: "date", half: true },
          { name: "weightage", label: "Weightage (%)", type: "number", min: "0", step: "0.01", defaultValue: "100", required: true, half: true },
        ]}
      />
    </DrawerForm>
  );
}

export function AddExam({
  terms,
  classLevels,
  subjects,
}: {
  terms: { value: string; label: string }[];
  classLevels: { value: string; label: string }[];
  subjects: { value: string; label: string }[];
}) {
  return (
    <DrawerForm
      trigger="Add exam"
      title="Add an exam"
      description="One subject, for one class, in a term"
    >
      <ManageForm
        bare
        title="Add an exam"
        action={createExam}
        submitLabel="Create exam"
        footnote="Marks entry opens a grid per section once the exam exists."
        fields={[
          { name: "termId", label: "Term", type: "select", required: true, options: terms },
          { name: "classLevelId", label: "Class", type: "select", required: true, options: classLevels, half: true },
          { name: "subjectId", label: "Subject", type: "select", required: true, options: subjects, half: true },
          { name: "name", label: "Exam name", required: true, placeholder: "Unit Test 1" },
          { name: "maxMarks", label: "Max marks", type: "number", min: "1", defaultValue: "100", required: true, half: true },
          { name: "passMarks", label: "Pass marks", type: "number", min: "0", defaultValue: "33", required: true, half: true },
        ]}
      />
    </DrawerForm>
  );
}
