import Link from "next/link";

import { FilterSelect, Pagination, SearchBox } from "@/components/data-controls";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  type Tone,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { Avatar } from "@/components/avatar";
import { formatDate } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Students" };

const PAGE_SIZE = 25;

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  ALUMNI: "info",
  TRANSFERRED: "warning",
  DROPPED: "danger",
  SUSPENDED: "danger",
  ON_LEAVE: "warning",
};

export default async function StudentsPage({
  searchParams,
}: PageProps<"/students">) {
  const session = await requirePermission("students.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;

  const query = typeof params.q === "string" ? params.q.trim() : "";
  const sectionId = typeof params.section === "string" ? params.section : "";
  const status = typeof params.status === "string" ? params.status : "";
  const page = Math.max(1, Number(params.page) || 1);
  const yearId = session.academicYear?.id;

  const where: Prisma.StudentWhereInput = {
    deletedAt: null,
    ...(status ? { status: status as Prisma.EnumStudentStatusFilter["equals"] } : {}),
    ...(query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { admissionNo: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
          ],
        }
      : {}),
    ...(sectionId
      ? { enrollments: { some: { sectionId, ...(yearId ? { academicYearId: yearId } : {}) } } }
      : {}),
  };

  const [total, students, sections] = await Promise.all([
    db.student.count({ where }),
    db.student.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        gender: true,
        status: true,
        photoUrl: true,
        admissionDate: true,
        enrollments: {
          where: yearId ? { academicYearId: yearId } : undefined,
          take: 1,
          select: {
            rollNumber: true,
            section: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
          },
        },
        guardians: {
          where: { isPrimary: true },
          take: 1,
          select: { guardian: { select: { firstName: true, lastName: true, phone: true } } },
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
  ]);

  const canCreate = hasPermission(session.permissions, "students.create");
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Students"
        description={`${total} matching ${total === 1 ? "record" : "records"}`}
        action={
          canCreate ? (
            <ButtonLink href="/students/new">Add student</ButtonLink>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <SearchBox placeholder="Search name, admission no, email…" />
          <FilterSelect
            paramName="section"
            label="Class"
            allLabel="All classes"
            options={sections.map((section) => ({
              value: section.id,
              label: `${section.classLevel.name} ${section.name}`,
            }))}
          />
          <FilterSelect
            paramName="status"
            label="Status"
            allLabel="All statuses"
            options={Object.keys(STATUS_TONE).map((value) => ({
              value,
              label: value.replace("_", " ").toLowerCase(),
            }))}
          />
        </div>

        {students.length === 0 ? (
          <EmptyState
            title="No students match these filters"
            description="Try clearing the search or choosing a different class."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Admission no.</Th>
                  <Th>Class</Th>
                  <Th>Primary guardian</Th>
                  <Th>Admitted</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const enrollment = student.enrollments[0];
                  const guardian = student.guardians[0]?.guardian;
                  return (
                    <tr key={student.id} className="hover:bg-surface-hover">
                      <Td>
                        <Link
                          href={`/students/${student.id}`}
                          className="flex items-center gap-2.5"
                        >
                          <Avatar
                            firstName={student.firstName}
                            lastName={student.lastName}
                            photoUrl={student.photoUrl}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:text-brand">
                              {student.firstName} {student.lastName}
                            </span>
                            {enrollment?.rollNumber ? (
                              <span className="block text-xs text-muted">
                                Roll {enrollment.rollNumber}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </Td>
                      <Td className="font-mono text-xs">{student.admissionNo}</Td>
                      <Td className="text-muted-strong">
                        {enrollment
                          ? `${enrollment.section.classLevel.name} ${enrollment.section.name}`
                          : "Not enrolled"}
                      </Td>
                      <Td className="text-muted-strong">
                        {guardian ? (
                          <>
                            {guardian.firstName} {guardian.lastName}
                            <span className="block text-xs text-muted">
                              {guardian.phone}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="text-muted-strong">
                        {formatDate(student.admissionDate)}
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONE[student.status] ?? "neutral"}>
                          {student.status.replace("_", " ").toLowerCase()}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <div className="border-t border-border">
              <Pagination page={page} pageCount={pageCount} total={total} />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
