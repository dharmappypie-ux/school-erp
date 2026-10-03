"use client";

import { createClassLevel, createSection } from "@/app/(app)/academics/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";

export function AddClassLevel() {
  return (
    <DrawerForm
      trigger="Add class"
      title="Add a class"
      description="A grade or standard, e.g. Class 6 or Nursery"
    >
      <ManageForm
        bare
        title="Add a class"
        action={createClassLevel}
        submitLabel="Create class"
        footnote="Order controls where the class sits in every class-ordered list."
        fields={[
          { name: "name", label: "Class name", required: true, placeholder: "Class 6" },
          {
            name: "numericOrder",
            label: "Order",
            type: "number",
            min: "0",
            required: true,
            hint: "Lower numbers sort first (e.g. 6 for Class 6).",
            half: true,
          },
          {
            name: "stream",
            label: "Stream",
            placeholder: "Science / Commerce",
            hint: "Optional — for senior classes.",
            half: true,
          },
        ]}
      />
    </DrawerForm>
  );
}

export function AddSection({
  classLevels,
  teachers,
}: {
  classLevels: { value: string; label: string }[];
  teachers: { value: string; label: string }[];
}) {
  return (
    <DrawerForm
      trigger="Add section"
      title="Add a section"
      description="A division within a class for this academic year"
    >
      <ManageForm
        bare
        title="Add a section"
        action={createSection}
        submitLabel="Create section"
        footnote="Students can only be admitted or promoted into sections that exist."
        fields={[
          { name: "classLevelId", label: "Class", type: "select", required: true, options: classLevels },
          { name: "name", label: "Section", required: true, placeholder: "A", half: true },
          { name: "capacity", label: "Seats", type: "number", min: "1", defaultValue: "40", required: true, half: true },
          { name: "roomNumber", label: "Room", placeholder: "101", half: true },
          {
            name: "classTeacherId",
            label: "Class teacher",
            type: "select",
            options: teachers,
            hint: "Can be assigned later.",
            half: true,
          },
        ]}
      />
    </DrawerForm>
  );
}
