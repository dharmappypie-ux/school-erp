"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createCategory,
  createItem,
  deleteItem,
  recordMovement,
} from "@/app/(app)/inventory/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";
import { Button } from "@/components/ui";
import { MOVEMENT_TYPES, MOVEMENT_TYPE_LABEL } from "@/lib/inventory";

export function AddCategory() {
  return (
    <DrawerForm
      trigger="Add category"
      title="Add a category"
      description="Group items — Stationery, Lab equipment, Furniture, Sports…"
    >
      <ManageForm
        bare
        title="Add a category"
        action={createCategory}
        submitLabel="Create category"
        fields={[
          { name: "name", label: "Category name", required: true, placeholder: "Stationery" },
          { name: "description", label: "Description", type: "textarea", placeholder: "Optional." },
        ]}
      />
    </DrawerForm>
  );
}

export function AddItem({
  categories,
}: {
  categories: { value: string; label: string }[];
}) {
  return (
    <DrawerForm
      trigger="Add item"
      title="Add an inventory item"
      description="A consumable or asset you want to track stock for."
    >
      <ManageForm
        bare
        title="Add an inventory item"
        action={createItem}
        submitLabel="Add item"
        footnote="Opening stock is recorded as the first movement, so the ledger is complete from day one."
        fields={[
          { name: "name", label: "Item name", required: true, placeholder: "A4 paper ream" },
          { name: "sku", label: "SKU / code", placeholder: "STA-001", half: true },
          { name: "categoryId", label: "Category", type: "select", options: categories, half: true },
          { name: "unit", label: "Unit", placeholder: "piece", defaultValue: "unit", half: true },
          { name: "location", label: "Location", placeholder: "Store room A", half: true },
          { name: "quantity", label: "Opening stock", type: "number", min: "0", defaultValue: "0", required: true, half: true },
          { name: "reorderLevel", label: "Reorder level", type: "number", min: "0", defaultValue: "0", required: true, half: true },
          { name: "unitCost", label: "Unit cost (₹)", type: "number", min: "0", step: "0.01", half: true },
          { name: "notes", label: "Notes", type: "textarea", placeholder: "Optional." },
        ]}
      />
    </DrawerForm>
  );
}

/**
 * Records a receipt, issue or adjustment. Used two ways: on the list page with
 * an item dropdown, and on an item's own page with that item fixed.
 */
export function RecordMovement({
  items,
  itemId,
  itemName,
  trigger = "Record movement",
}: {
  items?: { value: string; label: string }[];
  itemId?: string;
  itemName?: string;
  trigger?: string;
}) {
  const typeOptions = MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_TYPE_LABEL[t] }));

  return (
    <DrawerForm
      trigger={trigger}
      title={itemName ? `Stock movement — ${itemName}` : "Record a stock movement"}
      description="Receive new stock, issue it out, or correct the count after a stocktake."
    >
      <ManageForm
        bare
        title="Record a stock movement"
        action={recordMovement}
        submitLabel="Record movement"
        hiddenValues={itemId ? { itemId } : undefined}
        footnote="“Adjusted” sets the counted total directly — use it after a physical stocktake."
        fields={[
          ...(itemId
            ? []
            : ([
                {
                  name: "itemId",
                  label: "Item",
                  type: "select" as const,
                  required: true,
                  options: items ?? [],
                },
              ])),
          { name: "type", label: "Type", type: "select", required: true, options: typeOptions, half: true },
          { name: "quantity", label: "Quantity", type: "number", min: "0", required: true, half: true },
          { name: "reference", label: "Reference", placeholder: "PO-1234 / issued to…" },
          { name: "note", label: "Note", type: "textarea", placeholder: "Optional." },
        ]}
      />
    </DrawerForm>
  );
}

export function DeleteItemButton({ itemId, itemName }: { itemId: string; itemName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (!window.confirm(`Delete "${itemName}" and all its stock history? This cannot be undone.`)) {
              return;
            }
            setError(null);
            const result = await deleteItem(itemId);
            if (result.ok) router.push("/inventory");
            else setError(result.message);
          })
        }
      >
        {pending ? "Deleting…" : "Delete item"}
      </Button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
