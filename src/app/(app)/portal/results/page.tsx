import { ChildSwitcher } from "@/app/(app)/portal/child-switcher";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  type Tone,
} from "@/components/ui";
import { formatDate, formatPercent, toNumber } from "@/lib/format";
import { resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Results" };

const RESULT_TONE: Record<string, Tone> = {
  PASS: "success",
  FAIL: "danger",
  ABSENT: "warning",
};

export default async function PortalResultsPage({
  searchParams,
}: PageProps<"/portal/results">) {
  const params = await searchParams;
  const { context, child } = await resolvePortalStudent(params.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);

  // `isPublished` is the gate: an unpublished card is the school's working
  // draft and must never reach a family, even though it exists in the table.
  const cards = await db.reportCard.findMany({
    where: { studentId: child.id, isPublished: true },
    orderBy: { term: { sequence: "asc" } },
    include: {
      term: { select: { name: true } },
      academicYear: { select: { name: true } },
      lines: {
        orderBy: { subject: { name: "asc" } },
        include: {
          subject: { select: { name: true, isCoScholastic: true } },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Results"
        description={`${child.firstName} ${child.lastName ?? ""} · ${child.className ?? child.admissionNo}`}
      />

      <ChildSwitcher students={context.children} selectedId={child.id} />

      {cards.length === 0 ? (
        <Alert tone="info" title="No results published yet">
          Report cards appear here once the school publishes them. Results still
          being prepared are not shown.
        </Alert>
      ) : (
        <div className="space-y-4">
          {cards.map((card) => {
            const scholastic = card.lines.filter((line) => !line.subject.isCoScholastic);
            const coScholastic = card.lines.filter((line) => line.subject.isCoScholastic);
            const attendancePercent =
              card.attendanceTotal && card.attendanceTotal > 0
                ? ((card.attendancePresent ?? 0) / card.attendanceTotal) * 100
                : null;

            return (
              <Card key={card.id}>
                <CardHeader
                  title={`${card.term.name} — ${card.academicYear.name}`}
                  description={`Published ${formatDate(card.publishedAt, "long")}`}
                  action={
                    <div className="flex items-center gap-2">
                      <Badge tone="brand">{card.grade ?? "—"}</Badge>
                      <Badge tone={RESULT_TONE[card.result ?? ""] ?? "neutral"}>
                        {card.result?.toLowerCase() ?? "—"}
                      </Badge>
                    </div>
                  }
                />

                <div className="grid grid-cols-2 gap-4 border-b border-border px-5 py-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-muted uppercase">Percentage</p>
                    <p className="numeric text-lg font-semibold">
                      {formatPercent(toNumber(card.percentage), 2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted uppercase">Marks</p>
                    <p className="numeric text-lg font-semibold">
                      {toNumber(card.obtainedMarks)} / {toNumber(card.totalMarks)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted uppercase">Class rank</p>
                    <p className="numeric text-lg font-semibold">{card.rank ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted uppercase">Attendance</p>
                    <p className="numeric text-lg font-semibold">
                      {attendancePercent === null
                        ? "—"
                        : formatPercent(attendancePercent, 1)}
                    </p>
                  </div>
                </div>

                {scholastic.length === 0 ? (
                  <EmptyState title="No subject marks on this card" />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Subject</Th>
                        <Th className="text-right">Marks</Th>
                        <Th className="text-right">%</Th>
                        <Th className="text-center">Grade</Th>
                        <Th>Remark</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {scholastic.map((line) => (
                        <tr key={line.id}>
                          <Td className="font-medium">{line.subject.name}</Td>
                          <Td className="numeric text-right">
                            {line.obtainedMarks === null
                              ? "AB"
                              : `${toNumber(line.obtainedMarks)} / ${toNumber(line.maxMarks)}`}
                          </Td>
                          <Td className="numeric text-right">
                            {line.percentage === null
                              ? "—"
                              : formatPercent(toNumber(line.percentage), 1)}
                          </Td>
                          <Td className="text-center font-semibold">
                            {line.grade ?? "—"}
                          </Td>
                          <Td className="text-xs text-muted">{line.remarks ?? "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}

                {coScholastic.length > 0 ? (
                  <div className="border-t border-border px-5 py-4">
                    <p className="mb-2 text-[11px] font-semibold text-muted uppercase">
                      Co-scholastic areas
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {coScholastic.map((line) => (
                        <Badge key={line.id} tone="neutral">
                          {line.subject.name}: {line.grade ?? "—"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {card.remarks ? (
                  <div className="border-t border-border px-5 py-4">
                    <p className="text-[11px] text-muted uppercase">
                      Teacher&rsquo;s remarks
                    </p>
                    <p className="mt-1 text-sm">{card.remarks}</p>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
