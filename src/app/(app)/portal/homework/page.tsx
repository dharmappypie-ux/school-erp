import { AnswerSheet } from "@/app/(app)/portal/homework/answer-sheet";
import { SubmitForm } from "@/app/(app)/portal/homework/submit-form";
import { ChildSwitcher } from "@/app/(app)/portal/child-switcher";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  type Tone,
} from "@/components/ui";
import { formatDate, relativeDays, toNumber } from "@/lib/format";
import { resolvePortalStudent } from "@/lib/portal";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Homework" };

const STATUS_TONE: Record<string, Tone> = {
  ASSIGNED: "neutral",
  SUBMITTED: "success",
  LATE: "warning",
  GRADED: "success",
  RESUBMIT: "warning",
  MISSING: "danger",
};

export default async function PortalHomeworkPage({
  searchParams,
}: PageProps<"/portal/homework">) {
  const params = await searchParams;
  const { context, child } = await resolvePortalStudent(params.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);

  // tenant-safe: child.id is verified by resolvePortalStudent before this runs.
  const submissions = await db.homeworkSubmission.findMany({
    where: { studentId: child.id },
    orderBy: { homework: { dueOn: "desc" } },
    take: 50,
    select: {
      id: true,
      status: true,
      submittedAt: true,
      attachmentUrl: true,
      answers: {
        select: { questionId: true, selectedOption: true, textAnswer: true },
      },
      marksObtained: true,
      feedback: true,
      homework: {
        select: {
          id: true,
          title: true,
          description: true,
          dueOn: true,
          maxMarks: true,
          attachmentUrl: true,
          questions: {
            orderBy: { sequence: "asc" },
            select: {
              id: true, sequence: true, prompt: true,
              type: true, options: true, marks: true,
            },
          },
          subject: { select: { name: true } },
          author: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  // A guardian may file for a younger child; the record keeps who did it.
  const canSubmit = hasPermission(session.permissions, "homework.submit");

  const pending = submissions.filter(
    (row) => row.status === "ASSIGNED" || row.status === "MISSING",
  ).length;
  const submitted = submissions.filter(
    (row) => row.status === "SUBMITTED" || row.status === "GRADED" || row.status === "LATE",
  ).length;
  const graded = submissions.filter((row) => row.marksObtained !== null);
  const average =
    graded.length > 0
      ? graded.reduce(
          (sum, row) =>
            sum +
            (toNumber(row.marksObtained) / Math.max(1, toNumber(row.homework.maxMarks))) * 100,
          0,
        ) / graded.length
      : null;

  return (
    <>
      <PageHeader
        title="Homework"
        description={`${child.firstName} ${child.lastName ?? ""} · ${child.className ?? child.admissionNo}`}
      />

      <ChildSwitcher students={context.children} selectedId={child.id} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Pending"
          value={String(pending)}
          sublabel={pending > 0 ? "awaiting submission" : "nothing pending"}
          tone={pending > 0 ? "warning" : "success"}
        />
        <StatTile label="Submitted" value={String(submitted)} tone="success" />
        <StatTile
          label="Average score"
          value={average === null ? "—" : `${average.toFixed(0)}%`}
          sublabel={`${graded.length} graded`}
          tone={
            average === null ? "neutral"
            : average >= 75 ? "success"
            : average >= 50 ? "warning"
            : "danger"
          }
        />
      </div>

      <Card className="mt-4">
        <CardHeader title="Assignments" description="Most recent first" />
        {submissions.length === 0 ? (
          <EmptyState title="No homework assigned" />
        ) : (
          <ul className="divide-y divide-border">
            {submissions.map((row) => {
              const overdue =
                (row.status === "ASSIGNED" || row.status === "MISSING") &&
                row.homework.dueOn < new Date();
              return (
                <li key={row.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{row.homework.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {row.homework.subject.name}
                        {row.homework.author
                          ? ` · ${row.homework.author.firstName} ${row.homework.author.lastName ?? ""}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {row.marksObtained !== null ? (
                        <Badge tone="brand">
                          {toNumber(row.marksObtained)} / {toNumber(row.homework.maxMarks)}
                        </Badge>
                      ) : null}
                      <Badge tone={overdue ? "danger" : (STATUS_TONE[row.status] ?? "neutral")}>
                        {overdue ? "overdue" : row.status.toLowerCase()}
                      </Badge>
                    </div>
                  </div>

                  {row.homework.description ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-strong">
                      {row.homework.description}
                    </p>
                  ) : null}

                  <p className="mt-1.5 text-xs text-muted">
                    Due {formatDate(row.homework.dueOn, "long")} ({relativeDays(row.homework.dueOn)})
                    {row.submittedAt ? ` · submitted ${formatDate(row.submittedAt)}` : ""}
                  </p>

                  {row.homework.attachmentUrl ? (
                    <p className="mt-1.5 text-xs">
                      <a
                        href={row.homework.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand underline"
                      >
                        Download worksheet
                      </a>
                    </p>
                  ) : null}

                  {row.feedback ? (
                    <p className="mt-2 rounded-[var(--radius-base)] bg-surface-muted px-3 py-2 text-xs">
                      <span className="font-medium">Feedback:</span> {row.feedback}
                    </p>
                  ) : null}

                  {canSubmit && row.homework.questions.length > 0 ? (
                    <AnswerSheet
                      submissionId={row.id}
                      childId={child.id}
                      locked={row.status === "GRADED"}
                      questions={row.homework.questions.map((question) => {
                        const given = row.answers.find((a) => a.questionId === question.id);
                        return {
                          id: question.id,
                          sequence: question.sequence,
                          prompt: question.prompt,
                          type: question.type,
                          options: question.options,
                          marks: Number(question.marks),
                          selectedOption: given?.selectedOption ?? null,
                          textAnswer: given?.textAnswer ?? null,
                        };
                      })}
                    />
                  ) : null}

                  {canSubmit && row.status !== "GRADED" ? (
                    <SubmitForm
                      submissionId={row.id}
                      childId={child.id}
                      isResubmit={Boolean(row.submittedAt)}
                      attachmentUrl={row.attachmentUrl}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
