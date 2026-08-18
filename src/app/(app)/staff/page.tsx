import Link from "next/link";

import { FilterSelect, Pagination, SearchBox } from "@/components/data-controls";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  StatTile,
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

export const metadata = { title: "Staff" };

const PAGE_SIZE = 25;

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  PROBATION: "info",
  ON_LEAVE: "warning",
  RESIGNED: "neutral",
  TERMINATED: "danger",
  RETIRED: "neutral",
};

const TYPE_LABEL: Record<string, string> = {
  TEACHING: "Teaching",
  NON_TEACHING: "Non-teaching",
  ADMINISTRATIVE: "Administrative",
  SUPPORT: "Support",
  MANAGEMENT: "Management",
};

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const session = await requirePermission("staff.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;

  const query = typeof params.q === "string" ? params.q.trim() : "";
  const departmentId = typeof params.department === "string" ? params.department : "";
  const staffType = typeof params.type === "string" ? params.type : "";
  const status = typeof params.status === "string" ? params.status : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.StaffMemberWhereInput = {
    deletedAt: null,
    ...(departmentId ? { departmentId } : {}),
    ...(staffType ? { staffType: staffType as Prisma.EnumStaffTypeFilter["equals"] } : {}),
    ...(status
      ? { employmentStatus: status as Prisma.EnumEmploymentStatusFilter["equals"] }
      : {}),
    ...(query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { employeeId: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
          ],
        }
      : {}),
  };

  const [total, staff, departments, typeCounts, activeCount, onLeaveCount] =
    await Promise.all([
      db.staffMember.count({ where }),
      db.staffMember.findMany({
        where,
        orderBy: [{ firstName: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          email: true,
          phone: true,
          staffType: true,
          employmentStatus: true,
          joiningDate: true,
          department: { select: { name: true } },
          designation: { select: { name: true } },
          _count: { select: { classTeacherOf: true, subjectAssignments: true } },
        },
      }),
      db.department.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.staffMember.groupBy({
        by: ["staffType"],
        where: { deletedAt: null, employmentStatus: "ACTIVE" },
        _count: { _all: true },
      }),
      db.staffMember.count({ where: { deletedAt: null, employmentStatus: "ACTIVE" } }),
      db.leaveRequest.count({ where: { status: "PENDING" } }),
    ]);

  const teaching =
    typeCounts.find((row) => row.staffType === "TEACHING")?._count._all ?? 0;
  const canCreate = hasPermission(session.permissions, "staff.create");
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Staff"
        description={`${total} matching ${total === 1 ? "record" : "records"}`}
        action={
          canCreate ? <ButtonLink href="/staff/new">Add staff</ButtonLink> : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active staff" value={String(activeCount)} tone="success" />
        <StatTile
          label="Teaching"
          value={String(teaching)}
          sublabel={`${activeCount - teaching} non-teaching`}
        />
        <StatTile
          label="Departments"
          value={String(departments.length)}
        />
        <StatTile
          label="Leave requests"
          value={String(onLeaveCount)}
          sublabel={onLeaveCount > 0 ? "awaiting approval" : "none pending"}
          tone={onLeaveCount > 0 ? "warning" : "success"}
        />
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <SearchBox placeholder="Search name, employee ID, email…" />
          <FilterSelect
            paramName="department"
            label="Department"
            allLabel="All departments"
            options={departments.map((department) => ({
              value: department.id,
              label: department.name,
            }))}
          />
          <FilterSelect
            paramName="type"
            label="Type"
            allLabel="All types"
            options={Object.entries(TYPE_LABEL).map(([value, label]) => ({
              value,
              label,
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

        {staff.length === 0 ? (
          <EmptyState
            title="No staff match these filters"
            description="Try clearing the search or choosing a different department."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Employee ID</Th>
                  <Th>Designation</Th>
                  <Th>Department</Th>
                  <Th>Contact</Th>
                  <Th>Joined</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id} className="hover:bg-surface-hover">
                    <Td>
                      <Link
                        href={`/staff/${member.id}`}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar
                          firstName={member.firstName}
                          lastName={member.lastName}
                          photoUrl={member.photoUrl}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:text-brand">
                            {member.firstName} {member.lastName}
                          </span>
                          <span className="block text-xs text-muted">
                            {TYPE_LABEL[member.staffType] ?? member.staffType}
                            {member._count.classTeacherOf > 0
                              ? ` · class teacher`
                              : ""}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{member.employeeId}</Td>
                    <Td className="text-muted-strong">
                      {member.designation?.name ?? "—"}
                    </Td>
                    <Td className="text-muted-strong">
                      {member.department?.name ?? "—"}
                    </Td>
                    <Td className="text-muted-strong">
                      {member.phone ?? "—"}
                      {member.email ? (
                        <span className="block truncate text-xs text-muted">
                          {member.email}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-muted-strong">
                      {formatDate(member.joiningDate)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[member.employmentStatus] ?? "neutral"}>
                        {member.employmentStatus.replace("_", " ").toLowerCase()}
                      </Badge>
                    </Td>
                  </tr>
                ))}
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
