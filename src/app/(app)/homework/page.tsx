import Link from "next/link";

import { NewAssignment } from "@/app/(app)/homework/new-assignment";
import { FilterSelect } from "@/components/data-controls";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { daysUntilDue, progressOf } from "@/lib/homework";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Homework" };

export default async function HomeworkPage({ searchParams }: PageProps<"/homework">) {
  const session = await requirePermission("homework.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const yearId = session.academicYear?.id;
  const canManage = hasPermission(session.permissions, "homework.manage");

  const scope = typeof params.scope === "string" ? params.scope : "";
  // A teacher lands on their own assignments; an administrator sees everything.
  const mineOnly = scope === "mine" || (scope === "" && Boolean(session.staffId) && canManage);

  const [homework, sections, subjects] = await Promise.all([
    db.homework.findMany({
      where: {
        ...(mineOnly && session.staffId ? { authorId: session.staffId } : {}),
        ...(yearId ? { section: { academicYearId: yearId } } : {}),
      },
      orderBy: { dueOn: "desc" },
      take: 60,
      select: {
        id: true,
        title: true,
        dueOn: true,
        assignedOn: true,
        maxMarks: true,
        subject: { select: { name: true } },
        section: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
        author: { select: { firstName: true, lastName: true } },
        submissions: {
          select: { status: true, submittedAt: true, marksObtained: true },
        },
      },
    }),
    yearId
      ? db.section.findMany({
          where: { academicYearId: yearId },
          orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
          select: { id: true, name: true, classLevel: { select: { name: true } } },
        })
      : [],
    db.subject.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const now = new Date();
  const rows = homework.map((item) => ({
    ...item,
    progress: progressOf(
      item.submissions.map((s) => ({
        status: s.status,
        submittedAt: s.submittedAt,
        marksObtained: s.marksObtained ? Number(s.marksObtained) : null,
      })),
      item.dueOn,
      now,
    ),
    dueInDays: daysUntilDue(item.dueOn, now),
  }));

  const awaitingMarking = rows.reduce(
    (sum, row) => sum + (row.progress.submitted - row.progress.graded),
    0,
  );
  const openNow = rows.filter((row) => row.dueInDays >= 0).length;
  const missingTotal = rows.reduce((sum, row) => sum + row.progress.missing, 0);

  return (
    <>
      <PageHeader
        title="Homework"
        description={mineOnly ? "Assignments you set" : "Assignments across the school"}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Assignments" value={String(rows.length)} sublabel={`${openNow} still open`} />
        <StatTile
          label="Awaiting marking"
          value={String(awaitingMarking)}
          sublabel="submitted but not yet graded"
          tone={awaitingMarking > 0 ? "warning" : "success"}
        />
        <StatTile
          label="Not handed in"
          value={String(missingTotal)}
          sublabel="past the due date"
          tone={missingTotal > 0 ? "danger" : "success"}
        />
        <StatTile label="Subjects" value={String(subjects.length)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className={canManage ? "lg:col-span-2" : "lg:col-span-3"}>
          <CardHeader
            title="Assignments"
            description="Most recently due first"
            action={
              session.staffId ? (
                <FilterSelect
                  paramName="scope"
                  label="Scope"
                  allLabel="Mine"
                  options={[{ value: "all", label: "whole school" }]}
                />
              ) : null
            }
          />
          {rows.length === 0 ? (
            <EmptyState
              title="No assignments yet"
              description={canManage ? "Set one using the panel alongside." : undefined}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Assignment</Th>
                  <Th>Class</Th>
                  <Th>Due</Th>
                  <Th className="w-40">Handed in</Th>
                  <Th className="text-right">To mark</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-hover">
                    <Td>
                      <Link href={`/homework/${row.id}`} className="font-medium hover:text-brand">
                        {row.title}
                      </Link>
                      <span className="block text-[11px] text-muted">
                        {row.subject.name}
                        {row.author ? ` · ${row.author.firstName} ${row.author.lastName}` : ""}
                      </span>
                    </Td>
                    <Td className="text-muted-strong">
                      {row.section.classLevel.name} {row.section.name}
                    </Td>
                    <Td className="text-muted-strong">
                      {formatDate(row.dueOn)}
                      <span className="block text-[11px] text-muted">
                        {row.dueInDays === 0
                          ? "today"
                          : row.dueInDays > 0
                            ? `in ${row.dueInDays} days`
                            : `${Math.abs(row.dueInDays)} days ago`}
                      </span>
                    </Td>
                    <Td>
                      <ProgressBar
                        value={row.progress.submissionRate}
                        tone={row.progress.submissionRate >= 80 ? "success" : "warning"}
                      />
                      <span className="mt-1 block text-[11px] text-muted">
                        {row.progress.submitted}/{row.progress.total}
                        {row.progress.missing > 0 ? ` · ${row.progress.missing} missing` : ""}
                      </span>
                    </Td>
                    <Td className="text-right">
                      {row.progress.submitted - row.progress.graded > 0 ? (
                        <Badge tone="warning">
                          {row.progress.submitted - row.progress.graded}
                        </Badge>
                      ) : (
                        <Badge tone="success">done</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {canManage ? (
          <NewAssignment
            sections={sections.map((s) => ({
              id: s.id,
              label: `${s.classLevel.name} ${s.name}`,
            }))}
            subjects={subjects}
          />
        ) : null}
      </div>
    </>
  );
}
