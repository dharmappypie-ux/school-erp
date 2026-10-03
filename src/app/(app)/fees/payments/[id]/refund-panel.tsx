"use client";

import { useState, useTransition } from "react";

import { refundPayment } from "@/app/(app)/fees/actions";
import { SlideOver } from "@/components/slide-over";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";

export function RefundPanel({
  paymentId,
  receiptNo,
  maxRefundable,
  currency,
}: {
  paymentId: string;
  receiptNo: string;
  maxRefundable: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(maxRefundable));
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await refundPayment({
        paymentId,
        amount: Number(amount),
        reason,
      });
      setResult(res);
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Refund
      </Button>

      <SlideOver open={open} onClose={() => setOpen(false)} label="Refund receipt" width="w-[26rem]">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Refund receipt {receiptNo}</h2>
            <p className="mt-0.5 text-xs text-muted">
              Up to {currency} {maxRefundable} can be returned
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-[var(--radius-base)] p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
              <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {result ? (
            <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>
          ) : null}

          {result?.ok ? (
            <p className="text-sm text-muted">
              The invoices this receipt paid have been credited back. Close this
              panel to see the updated receipt.
            </p>
          ) : (
            <>
              <Field label="Refund amount" required>
                <Input
                  type="number"
                  className="numeric"
                  min="0"
                  step="0.01"
                  max={String(maxRefundable)}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field label="Reason" required>
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Duplicate payment, withdrawal, correction…"
                />
              </Field>
              <Button
                className="w-full"
                disabled={pending || reason.trim().length < 3 || Number(amount) <= 0}
                onClick={submit}
              >
                {pending ? "Refunding…" : "Issue refund"}
              </Button>
              <p className="text-[11px] text-muted">
                A refund reverses the amount off the invoices this receipt paid,
                so their balances reopen. It cannot be undone.
              </p>
            </>
          )}
        </div>
      </SlideOver>
    </>
  );
}
