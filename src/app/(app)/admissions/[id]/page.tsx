import Link from "next/link";
import { notFound } from "next/navigation";

import { DecisionPanel } from "@/app/(app)/admissions/[id]/decision-panel";
import { STATUS_TONE } from "@/app/(app)/admissions/page";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { APPLICATION_FLOW, STATUS_LABEL } from "@/lib/admissions";
import { formatDate, formatDateTime, initials, toNumber } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Application" };

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{value ?? "—"}</dd>
    </div>
  );
}

export default async function ApplicationPage({
  params,
}: PageProps<"/admissions/[id]">) {
  const session = await requirePermission("admissions.read");
  const db = scopedDb(session.schoolId);
  const { id } = await params;
  const yearId = session.academicYear?.id;

  const application = await db.admissionApplication.findUnique({
    where: { id },
    include: {
      classLevel: { select: { id: true, name: true } },
      academicYear: { select: { name: true } },
      student: { select: { id: true, admissionNo: true } },
      documents: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!application) notFound();

  // Sections of the applied-for class, with remaining seats.
  const sections =
    yearId && application.status === "ACCEPTED"
      ? await db.section.findMany({
          where: { academicYearId: yearId, classLevelId: application.classLevelId },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            capacity: true,
            classLevel: { select: { name: true } },
            _count: { select: { enrollments: { where: { isActive: true } } } },
          },
        })
      : [];

  const canManage = hasPermission(session.permissions, "admissions.manage");
  const allowedNext = APPLICATION_FLOW[application.status].filter(
    (status) => status !== "ENROLLED",
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
              {initials(application.firstName, application.lastName)}
            </span>
            {application.firstName} {application.middleName} {application.lastName}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{application.applicationNo}</span>
            <span>·</span>
            <span>{application.classLevel.name}</span>
            <span>·</span>
            <span>{application.academicYear.name}</span>
            <Badge tone={STATUS_TONE[application.status] ?? "neutral"}>
              {STATUS_LABEL[application.status]}
            </Badge>
          </span>
        }
        action={
          <Link
            href="/admissions"
            className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
          >
            Back to list
          </Link>
        }
      />

      {application.student ? (
        <div className="mb-4">
          <Alert tone="success" title="Enrolled">
            This applicant is now a student —{" "}
            <Link
              href={`/students/${application.student.id}`}
              className="font-semibold underline"
            >
              {application.student.admissionNo}
            </Link>
            .
          </Alert>
        </div>
      ) : !application.applicationFeePaid && application.status !== "DRAFT" ? (
        <div className="mb-4">
          <Alert tone="warning" title="Application fee unpaid">
            The application fee has not been recorded as paid.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Applicant" />
          <dl className="px-5 py-2">
            <DetailRow
              label="Date of birth"
              value={formatDate(application.dateOfBirth, "long")}
            />
            <DetailRow label="Gender" value={application.gender?.toLowerCase()} />
            <DetailRow label="Applying for" value={application.classLevel.name} />
            <DetailRow label="Previous school" value={application.previousSchool} />
            <DetailRow label="Previous class" value={application.previousClass} />
            <DetailRow
              label="Previous score"
              value={
                application.previousPercentage
                  ? `${toNumber(application.previousPercentage)}%`
                  : null
              }
            />
            <DetailRow
              label="Address"
              value={
                [
                  application.addressLine1,
                  application.city,
                  application.state,
                  application.postalCode,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Guardian & process" />
          <dl className="px-5 py-2">
            <DetailRow label="Guardian" value={application.guardianName} />
            <DetailRow
              label="Relationship"
              value={application.relationship?.toLowerCase()}
            />
            <DetailRow label="Phone" value={application.guardianPhone} />
            <DetailRow label="Email" value={application.guardianEmail} />
            <DetailRow label="Source" value={application.source} />
            <DetailRow
              label="Submitted"
              value={
                application.submittedAt
                  ? formatDate(application.submittedAt, "long")
                  : "not submitted"
              }
            />
            <DetailRow
              label="Entrance score"
              value={application.score === null ? null : String(toNumber(application.score))}
            />
            <DetailRow label="Test date" value={formatDate(application.testDate)} />
            <DetailRow
              label="Interview"
              value={formatDate(application.interviewDate)}
            />
            <DetailRow
              label="Fee paid"
              value={application.applicationFeePaid ? "Yes" : "No"}
            />
            {application.rejectionReason ? (
              <DetailRow label="Rejection reason" value={application.rejectionReason} />
            ) : null}
          </dl>
        </Card>

        {canManage ? (
          <Card className="h-fit">
            <CardHeader
              title="Decision"
              description={`Currently ${STATUS_LABEL[application.status].toLowerCase()}`}
            />
            <DecisionPanel
              applicationId={application.id}
              currentStatus={application.status}
              allowedNext={allowedNext}
              canEnrol={application.student === null}
              sections={sections.map((section) => ({
                id: section.id,
                label: `${section.classLevel.name} ${section.name}`,
                seatsLeft: section.capacity - section._count.enrollments,
              }))}
            />
          </Card>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Timeline" description="Every stage change on record" />
          {application.events.length === 0 ? (
            <EmptyState title="No stage changes recorded" />
          ) : (
            <ol className="divide-y divide-border">
              {application.events.map((event) => (
                <li key={event.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    aria-hidden
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {event.fromStatus
                        ? `${STATUS_LABEL[event.fromStatus]} → ${STATUS_LABEL[event.toStatus]}`
                        : STATUS_LABEL[event.toStatus]}
                    </p>
                    {event.note ? (
                      <p className="mt-0.5 text-xs text-muted-strong">{event.note}</p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] text-muted">
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Documents"
            description={`${application.documents.length} on file`}
          />
          {application.documents.length === 0 ? (
            <EmptyState
              title="No documents uploaded"
              description="Birth certificate, transfer certificate and previous mark sheets are typically required."
            />
          ) : (
            <ul className="divide-y divide-border">
              {application.documents.map((document) => (
                <li
                  key={document.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{document.title}</p>
                    <p className="text-xs text-muted">
                      {document.kind.replace("_", " ").toLowerCase()} ·{" "}
                      {formatDate(document.createdAt)}
                    </p>
                  </div>
                  <Badge tone={document.isVerified ? "success" : "warning"}>
                    {document.isVerified ? "verified" : "unverified"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
