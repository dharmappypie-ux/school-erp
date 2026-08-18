import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MarksGrid,
  type MarksRow,
} from "@/app/(app)/exams/[examId]/marks/marks-grid";
import { FilterSelect } from "@/components/data-controls";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requireAnyPermission } from "@/lib/auth";
import { formatDate, toNumber } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Marks entry" };

export default async function MarksEntryPage({
  params,
  searchParams,
}: PageProps<"/exams/[examId]/marks">) {
  const session = await requireAnyPermission(["marks.read", "marks.enter"]);
  const db = scopedDb(session.schoolId);
  const { examId } = await params;
  const query = await searchParams;
  const yearId = session.academicYear?.id;

  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      name: true,
      maxMarks: true,
      passMarks: true,
      status: true,
      classLevelId: true,
      classLevel: { select: { name: true } },
      subject: { select: { name: true, code: true } },
      term: { select: { name: true } },
    },
  });
  if (!exam) notFound();

  const sections = yearId
    ? await db.section.findMany({
        where: { academicYearId: yearId, classLevelId: exam.classLevelId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const sectionId =
    typeof query.section === "string" && query.section
      ? query.section
      : (sections[0]?.id ?? "");

  const [enrollments, existing] = await Promise.all([
    sectionId && yearId
      ? db.enrollment.findMany({
          where: { sectionId, academicYearId: yearId, isActive: true },
          orderBy: { rollNumber: "asc" },
          select: {
            rollNumber: true,
            student: {
              select: { id: true, firstName: true, lastName: true, admissionNo: true },
            },
          },
        })
      : [],
    db.markEntry.findMany({
      where: { examId },
      select: { studentId: true, marksObtained: true, isAbsent: true },
    }),
  ]);

  const existingByStudent = new Map(
    existing.map((entry) => [entry.studentId, entry]),
  );

  const rows: MarksRow[] = enrollments.map((enrollment) => {
    const entry = existingByStudent.get(enrollment.student.id);
    return {
      studentId: enrollment.student.id,
      firstName: enrollment.student.firstName,
      lastName: enrollment.student.lastName,
      admissionNo: enrollment.student.admissionNo,
      rollNumber: enrollment.rollNumber,
      marks:
        entry && !entry.isAbsent && entry.marksObtained !== null
          ? String(toNumber(entry.marksObtained))
          : "",
      isAbsent: entry?.isAbsent ?? false,
    };
  });

  const canEnter = hasPermission(session.permissions, "marks.enter");

  return (
    <>
      <PageHeader
        title={`${exam.subject.name} — ${exam.classLevel.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{exam.term.name}</span>
            <span>·</span>
            <span>Max {String(exam.maxMarks)}</span>
            <span>·</span>
            <span>Pass {String(exam.passMarks)}</span>
            <Badge tone="neutral">{exam.status.replace("_", " ").toLowerCase()}</Badge>
          </span>
        }
        action={
          <Link
            href="/exams"
            className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
          >
            Back to exams
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="Mark sheet"
          description={
            canEnter
              ? "Enter or Arrow keys move down the column. Blank entries are left untouched."
              : "You have view-only access to marks."
          }
          action={
            sections.length > 1 ? (
              <FilterSelect
                paramName="section"
                label="Section"
                allLabel="Select section"
                options={sections.map((section) => ({
                  value: section.id,
                  label: `Section ${section.name}`,
                }))}
              />
            ) : undefined
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            title="No students enrolled"
            description="This class has no active enrolments for the current academic year."
          />
        ) : (
          <MarksGrid
            examId={exam.id}
            sectionId={sectionId}
            maxMarks={toNumber(exam.maxMarks)}
            passMarks={toNumber(exam.passMarks)}
            rows={rows}
            readOnly={!canEnter}
          />
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        Last updated {formatDate(new Date())}. Saved marks feed report card
        generation and the AI risk model.
      </p>
    </>
  );
}
