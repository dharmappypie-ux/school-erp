"use client";

import { Button } from "@/components/ui";

/**
 * Uses the browser's own print dialog rather than server-side PDF generation:
 * it produces a correct, selectable document with no extra dependency, and
 * "Save as PDF" is available in every target browser.
 */
export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      Print / Save as PDF
    </Button>
  );
}
