"use client";

import { generateInvoices } from "@/app/(app)/fees/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";

export function GenerateInvoices({
  structures,
}: {
  structures: { value: string; label: string }[];
}) {
  return (
    <DrawerForm
      trigger="Generate invoices"
      title="Generate invoices"
      description="Bill every active student covered by a fee structure"
    >
      <ManageForm
        bare
        title="Generate invoices"
        action={generateInvoices}
        submitLabel="Generate"
        footnote="Students already billed from this structure are skipped, so it is safe to re-run."
        fields={[
          { name: "structureId", label: "Fee structure", type: "select", required: true, options: structures },
          {
            name: "dueDate",
            label: "Due date",
            type: "date",
            hint: "Leave blank to use the structure's own due dates (or 30 days out).",
            half: true,
          },
          { name: "period", label: "Period label", placeholder: "Term 1", half: true },
        ]}
      />
    </DrawerForm>
  );
}
