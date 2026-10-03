"use client";

import { createSchool } from "@/app/(app)/platform/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";

export function AddSchool() {
  return (
    <DrawerForm
      trigger="Add school"
      title="Add a school"
      description="Creates the school, its roles, a current year and a first admin login"
      width="w-[34rem]"
    >
      <ManageForm
        bare
        title="Add a school"
        action={createSchool}
        submitLabel="Create school"
        footnote="The first admin gets a one-time password, shown once after saving. They sign in and add their own staff and students."
        fields={[
          { name: "name", label: "School name", required: true, placeholder: "Riverside Academy" },
          { name: "slug", label: "URL slug", placeholder: "riverside", hint: "Optional — derived from the name if left blank.", half: true },
          { name: "code", label: "Code", placeholder: "RA", half: true },
          { name: "board", label: "Board", placeholder: "CBSE / ICSE / State", half: true },
          { name: "currency", label: "Currency", placeholder: "INR", defaultValue: "INR", half: true },
          { name: "city", label: "City", half: true },
          { name: "state", label: "State", half: true },
          { name: "yearName", label: "Academic year", required: true, placeholder: "2026-27" },
          { name: "yearStart", label: "Year starts", type: "date", required: true, half: true },
          { name: "yearEnd", label: "Year ends", type: "date", required: true, half: true },
          { name: "adminFirstName", label: "Admin first name", required: true, half: true },
          { name: "adminLastName", label: "Admin last name", half: true },
          { name: "adminEmail", label: "Admin email (login)", required: true, placeholder: "admin@riverside.edu.in" },
        ]}
      />
    </DrawerForm>
  );
}
