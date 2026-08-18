"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markPayrollPaid, runPayroll } from "@/app/(app)/payroll/actions";
import { Alert, Button, Field, Select } from "@/components/ui";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function RunPanel({
  defaultMonth,
  defaultYear,
  canManage,
}: {
  defaultMonth: number;
  defaultYear: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(String(defaultMonth));
  const [year, setYear] = useState(String(defaultYear));
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const years = [defaultYear - 1, defaultYear, defaultYear + 1];

  function run(action: "generate" | "pay") {
    startTransition(async () => {
      const payload = { month: Number(month), year: Number(year) };
      const response =
        action === "generate"
          ? await runPayroll(payload)
          : await markPayrollPaid(payload);
      setResult(response);
      if (response.ok) {
        router.replace(`/payroll?month=${month}&year=${year}`);
      }
    });
  }

  return (
    <div className="space-y-4 px-5 py-5">
      {result ? (
        <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>
      ) : null}

      <Field label="Month">
        <Select value={month} onChange={(event) => setMonth(event.target.value)}>
          {MONTHS.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Year">
        <Select value={year} onChange={(event) => setYear(event.target.value)}>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </Field>

      {canManage ? (
        <div className="space-y-2">
          <Button className="w-full" disabled={pending} onClick={() => run("generate")}>
            {pending ? "Working…" : "Generate payslips"}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => run("pay")}
          >
            Mark month as paid
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted">
        Generating recomputes drafts from each staff member&rsquo;s salary
        structure and any unpaid leave in the month. Payslips already marked
        paid are never overwritten.
      </p>
    </div>
  );
}
