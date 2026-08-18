import Link from "next/link";
import { notFound } from "next/navigation";

import { GradeRow } from "@/app/(app)/homework/[id]/grade-row";
import { Worksheet } from "@/app/(app)/homework/[id]/worksheet";
import { WorksheetBuilder } from "@/app/(app)/homework/[id]/worksheet-builder";
import { autoMarkableShare } from "@/lib/worksheet";
import { Avatar } from "@/components/avatar";
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
  type Tone,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { displayStatus, progressOf } from "@/lib/homework";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Assignment" };

const STATUS_TONE: Record<string, Tone> = {
  GRADED: "success",
  SUBMITTED: "info",
  LATE: "warning",
  RESUBMIT: "warning",
  MISSING: "danger",
  ASSIGNED: "neutral",
};

export default async function AssignmentPage({ params }: PageProps<"/homework/[id]">) {
  const session = await requirePermission("homework.read");
  const db = scopedDb(session.schoolId);
  const { id } = await params;
  const canManage = hasPermission(session.permissions, "homework.manage");

  const homework = await db.homework.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      assignedOn: true,
      dueOn: true,
      maxMarks: true,
      attachmentUrl: true,
      questions: {
        orderBy: { sequence: "asc" },
        select: {
          id: true, sequence: true, prompt: true, type: true,
          options: true, correctOption: true, marks: true,
        },
      },
      subject: { select: { name: true } },
      section: { select: { name: true, classLevel: { select: { name: true } } } },
      author: { select: { firstName: true, lastName: true } },
      submissions: {
        orderBy: { student: { rollNumber: "asc" } },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          content: true,
          attachmentUrl: true,
          marksObtained: true,
          answers: {
            select: {
              questionId: true, selectedOption: true, textAnswer: true,
              isCorrect: true, awardedMarks: true, needsReview: true,
            },
          },
          feedback: true,
          gradedAt: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              rollNumber: true,
              photoUrl: true,
            },
          },
        },
      },
    },
  });

  if (!homework) notFound();

  const now = new Date();
  const maxMarks = homework.maxMarks ? Number(homework.maxMarks) : null;
  const questionRows = homework.questions.map((question) => ({
    id: question.id,
    sequence: question.sequence,
    prompt: question.prompt,
    type: question.type,
    options: question.options,
    correctOption: question.correctOption,
    marks: Number(question.marks),
  }));

  const reviewCount = homework.submissions.reduce(
    (sum, submission) => sum + submission.answers.filter((a) => a.needsReview).length,
    0,
  );

  const progress = progressOf(
    homework.submissions.map((s) => ({
      status: s.status,
      submittedAt: s.submittedAt,
      marksObtained: s.marksObtained ? Number(s.marksObtained) : null,
    })),
    homework.dueOn,
    now,
  );

  return (
    <>
      <PageHeader
        title={homework.title}
        description={`${homework.section.classLevel.name} ${homework.section.name} · ${homework.subject.name} · due ${formatDate(homework.dueOn)}`}
        action={
          <Link href="/homework" className="text-xs font-medium text-brand">
            Back to homework
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Handed in"
          value={`${progress.submitted}/${progress.total}`}
          sublabel={`${progress.submissionRate}% of the class`}
          tone={progress.submissionRate >= 80 ? "success" : "warning"}
        />
        <StatTile
          label="Marked"
          value={String(progress.graded)}
          sublabel={`${progress.gradedRate}% of what came in`}
          tone={progress.graded === progress.submitted ? "success" : "warning"}
        />
        <StatTile
          label="Not handed in"
          value={String(progress.missing)}
          sublabel="past the due date"
          tone={progress.missing > 0 ? "danger" : "success"}
        />
        <StatTile
          label="Late"
          value={String(progress.late)}
          sublabel={maxMarks ? `out of ${maxMarks} marks` : "ungraded assignment"}
        />
      </div>

      {homework.description || canManage || homework.attachmentUrl ? (
        <Card className="mt-4">
          <CardHeader title="Instructions and worksheet" />
          <div className="space-y-2 px-5 py-4">
            {homework.description ? (
              <p className="whitespace-pre-wrap text-sm text-muted-strong">
                {homework.description}
              </p>
            ) : null}

            {canManage ? (
              <Worksheet
                homeworkId={homework.id}
                attachmentUrl={homework.attachmentUrl}
              />
            ) : homework.attachmentUrl ? (
              <a
                href={homework.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-brand underline"
              >
                Download worksheet
              </a>
            ) : null}
          </div>
        </Card>
      ) : null}

      {canManage ? (
        <WorksheetBuilder
          homeworkId={homework.id}
          questions={questionRows}
          autoShare={autoMarkableShare(
            questionRows.map((q) => ({
              id: q.id,
              type: q.type,
              correctOption: q.correctOption,
              options: q.options,
              marks: q.marks,
            })),
          )}
          reviewCount={reviewCount}
        />
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Class register"
          description={
            canManage
              ? "Enter a mark against each submission"
              : "Submission status for the class"
          }
          action={
            <span className="w-40">
              <ProgressBar
                value={progress.submissionRate}
                tone={progress.submissionRate >= 80 ? "success" : "warning"}
              />
            </span>
          }
        />
        {homework.submissions.length === 0 ? (
          <EmptyState
            title="No students enrolled"
            description="This class has no active enrolments, so nobody was assigned the work."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
                <Th className="text-right">Mark</Th>
                {canManage ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {homework.submissions.map((submission) => {
                const state = displayStatus(
                  {
                    status: submission.status,
                    submittedAt: submission.submittedAt,
                    marksObtained: submission.marksObtained
                      ? Number(submission.marksObtained)
                      : null,
                  },
                  homework.dueOn,
                  now,
                );

                return (
                  <tr key={submission.id} className="hover:bg-surface-hover">
                    <Td>
                      <Link
                        href={`/students/${submission.student.id}`}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar
                          firstName={submission.student.firstName}
                          lastName={submission.student.lastName}
                          photoUrl={submission.student.photoUrl}
                          size="sm"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:text-brand">
                            {submission.student.firstName} {submission.student.lastName}
                          </span>
                          <span className="block font-mono text-[11px] text-muted">
                            {submission.student.admissionNo}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[state] ?? "neutral"}>
                        {state.toLowerCase()}
                      </Badge>
                      {submission.answers.some((a) => a.needsReview) ? (
                        <Badge tone="warning" className="ml-1">
                          {submission.answers.filter((a) => a.needsReview).length} to check
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-muted-strong">
                      {submission.submittedAt ? (
                        formatDateTime(submission.submittedAt)
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {submission.content ? (
                        <span className="block max-w-xs truncate text-[11px] text-muted">
                          {submission.content}
                        </span>
                      ) : null}
                      {submission.attachmentUrl ? (
                        <a
                          href={submission.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-[11px] font-medium text-brand underline"
                        >
                          Open attachment
                        </a>
                      ) : null}
                    </Td>
                    <Td className="numeric text-right">
                      {submission.marksObtained !== null ? (
                        <>
                          {Number(submission.marksObtained)}
                          {maxMarks ? (
                            <span className="text-muted"> / {maxMarks}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {submission.feedback ? (
                        <span className="block max-w-xs truncate text-[11px] text-muted">
                          {submission.feedback}
                        </span>
                      ) : null}
                    </Td>
                    {canManage ? (
                      <Td>
                        <GradeRow
                          submissionId={submission.id}
                          maxMarks={maxMarks}
                          currentMarks={
                            submission.marksObtained !== null
                              ? Number(submission.marksObtained)
                              : null
                          }
                          currentFeedback={submission.feedback}
                        />
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
