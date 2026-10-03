"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { checkOriginality } from "@/app/(app)/homework/[id]/originality-actions";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  ORIGINALITY_FLAG_LABEL,
  ORIGINALITY_FLAG_TONE,
  type OriginalityFlag,
} from "@/lib/ai/originality";

export interface OriginalityRow {
  id: string;
  name: string;
  hasContent: boolean;
  flag: OriginalityFlag | null;
  score: number | null;
  note: string | null;
}

/**
 * Teacher-facing originality panel. Runs the check on demand and shows a flag,
 * score and note per submission. Flagged rows sort to the top so the ones that
 * need a second look are seen first.
 */
export function OriginalityPanel({
  homeworkId,
  rows,
  checkedAt,
}: {
  homeworkId: string;
  rows: OriginalityRow[];
  checkedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  const withText = rows.filter((r) => r.hasContent);
  const checked = withText.filter((r) => r.flag !== null);
  const flagged = checked.filter((r) => r.flag !== "ORIGINAL");

  const sorted = [...checked].sort((a, b) => (a.score ?? 100) - (b.score ?? 100));

  return (
    <Card className="mt-4">
      <CardHeader
        title="Originality check"
        description={
          checkedAt
            ? `Last run ${checkedAt} · ${flagged.length} flagged of ${checked.length}`
            : "Compare written submissions for copying, and screen for AI-generated work"
        }
        action={
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || withText.length === 0}
            onClick={() =>
              startTransition(async () => {
                setNote(null);
                const result = await checkOriginality(homeworkId);
                setNote(result);
                if (result.ok) router.refresh();
              })
            }
          >
            {pending ? "Checking…" : checkedAt ? "Re-run check" : "Run check"}
          </Button>
        }
      />

      <div className="px-5 py-4">
        {note ? (
          <div className="mb-3">
            <Alert tone={note.ok ? "success" : "danger"}>{note.message}</Alert>
          </div>
        ) : null}

        {withText.length === 0 ? (
          <EmptyState
            title="No written submissions"
            description="The check compares typed answers. Attachments and worksheet answers are not analysed."
          />
        ) : checked.length === 0 ? (
          <p className="text-sm text-muted">
            {withText.length} written submission{withText.length === 1 ? "" : "s"} ready to check.
            Run the check to screen for copying and AI-generated work.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th className="text-right">Originality</Th>
                <Th>Flag</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id} className="hover:bg-surface-hover">
                  <Td className="font-medium">{row.name}</Td>
                  <Td className="numeric text-right">{row.score ?? "—"}</Td>
                  <Td>
                    {row.flag ? (
                      <Badge tone={ORIGINALITY_FLAG_TONE[row.flag]}>
                        {ORIGINALITY_FLAG_LABEL[row.flag]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-muted-strong">{row.note ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}
