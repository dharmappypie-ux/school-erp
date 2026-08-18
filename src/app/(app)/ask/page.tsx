import { AskPanel } from "@/app/(app)/ask/ask-panel";
import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Ask your data" };

export default async function AskPage() {
  const session = await requirePermission("ai.query");
  const db = scopedDb(session.schoolId);

  const recent = await db.aiQueryLog.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      question: true,
      rowCount: true,
      success: true,
      model: true,
      durationMs: true,
      createdAt: true,
    },
  });

  return (
    <>
      <PageHeader
        title="Ask your data"
        description="Questions in plain English, answered from your school's records."
      />

      <AskPanel aiEnabled={Boolean(env.ai.apiKey)} />

      <Card className="mt-4">
        <CardHeader title="Your recent questions" description="Last 10" />
        {recent.length === 0 ? (
          <EmptyState title="Nothing asked yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Question</Th>
                <Th className="text-right">Rows</Th>
                <Th>Answered by</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <Td className={entry.success ? "" : "text-muted"}>
                    {entry.question}
                  </Td>
                  <Td className="numeric text-right">
                    {entry.success ? (entry.rowCount ?? 0) : "—"}
                  </Td>
                  <Td className="text-muted-strong">
                    {entry.model}
                    {entry.durationMs ? (
                      <span className="block text-[11px] text-muted">
                        {entry.durationMs}ms
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-muted-strong">
                    {formatDateTime(entry.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        The model chooses from a fixed list of data sources and fields — it does
        not write database queries, and it is never shown your records. Every
        answer is limited to your school and to data you already have permission
        to read. How each question was interpreted is shown above the results so
        a misreading is visible rather than silent.
      </p>
    </>
  );
}
