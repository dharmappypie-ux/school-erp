"use client";

import { createCourse } from "@/app/(app)/academics/courses/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";

export function AddCourse({
  classLevels,
  subjects,
  teachers,
}: {
  classLevels: { value: string; label: string }[];
  subjects: { value: string; label: string }[];
  teachers: { value: string; label: string }[];
}) {
  return (
    <DrawerForm
      trigger="New course"
      title="Create a course"
      description="A course of digital lessons and resources. It stays a draft until you publish it."
    >
      <ManageForm
        bare
        title="Create a course"
        action={createCourse}
        submitLabel="Create course"
        footnote="Target a class so the course reaches those students in the portal once published."
        fields={[
          { name: "title", label: "Title", required: true, placeholder: "Introduction to Fractions" },
          {
            name: "summary",
            label: "Summary",
            placeholder: "One line shown on the course card",
          },
          {
            name: "description",
            label: "Description",
            type: "textarea",
            placeholder: "What the course covers and who it is for.",
          },
          { name: "classLevelId", label: "Class", type: "select", options: classLevels, half: true },
          { name: "subjectId", label: "Subject", type: "select", options: subjects, half: true },
          {
            name: "teacherId",
            label: "Teacher",
            type: "select",
            options: teachers,
            hint: "Shown as the course instructor.",
          },
        ]}
      />
    </DrawerForm>
  );
}
