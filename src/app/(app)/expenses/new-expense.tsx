"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { recordExpense } from "@/app/(app)/expenses/actions";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";

const MODES = [
  "BANK_TRANSFER", "CASH", "CHEQUE", "UPI", "CARD",
  "NETBANKING", "DEMAND_DRAFT", "WALLET", "ADJUSTMENT",
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={pending}>
      {pending ? "Recording…" : "Record voucher"}
    </Button>
  );
}

export function NewExpense({ knownCategories }: { knownCategories: string[] }) {
  const [state, action] = useActionState(recordExpense, null);
  const keep = (name: string) => state?.values?.[name] ?? "";

  return (
    <Card className="h-fit">
      <CardHeader title="Record an expense" description="Numbered automatically" />
      <form action={action} className="space-y-3 px-5 py-5">
        {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}

        <Field label="Category" required>
          <Input
            name="category"
            list="expense-categories"
            defaultValue={keep("category")}
            placeholder="Utilities"
            required
          />
          <datalist id="expense-categories">
            {knownCategories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" required>
            <Input
              type="number" name="amount" min="0.01" step="0.01"
              defaultValue={keep("amount")} className="numeric" required
            />
          </Field>
          <Field label="Tax">
            <Input
              type="number" name="taxAmount" min="0" step="0.01"
              defaultValue={keep("taxAmount")} className="numeric"
            />
          </Field>
        </div>

        <Field label="Paid to">
          <Input name="paidTo" defaultValue={keep("paidTo")} placeholder="Vendor name" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" required>
            <Input type="date" name="paidAt" defaultValue={keep("paidAt")} required />
          </Field>
          <Field label="Mode" required>
            <Select name="mode" defaultValue={keep("mode") || "BANK_TRANSFER"} required>
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Reference">
          <Input name="referenceNo" defaultValue={keep("referenceNo")} placeholder="Cheque or UTR" />
        </Field>

        <Field label="Description">
          <Textarea name="description" defaultValue={keep("description")} rows={2} />
        </Field>

        <Submit />
      </form>
    </Card>
  );
}
