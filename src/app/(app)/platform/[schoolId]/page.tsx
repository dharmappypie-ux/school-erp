import Link from "next/link";
import { notFound } from "next/navigation";

import { AddSchoolAdmin, SchoolAdminActions } from "@/app/(app)/platform/[schoolId]/admin-panels";
import { Avatar } from "@/components/avatar";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  Table,
  Td,
  Th,
  type Tone,
} from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PLATFORM_WORKSPACE_SLUG } from "@/lib/permissions";

export const metadata = { title: "School" };

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  PENDING_VERIFICATION: "info",
  SUSPENDED: "danger",
  INACTIVE: "neutral",
};

export default async function PlatformSchoolPage({
  params,
}: PageProps<"/platform/[schoolId]">) {
  await requirePlatformAdmin();
  const { schoolId } = await params;

  // Cross-tenant read, platform-owner only. The hidden platform workspace is
  // never manageable as if it were a school.
  const school = await prisma.school.findFirst({
    where: { id: schoolId, slug: { not: PLATFORM_WORKSPACE_SLUG } },
    select: {
      id: true,
      name: true,
      slug: true,
      code: true,
      board: true,
      city: true,
      state: true,
      plan: true,
      isActive: true,
      createdAt: true,
      _count: { select: { students: true, staff: true, users: true } },
    },
  });
  if (!school) notFound();

  // The school's administrators (super admins and admins), never platform owners.
  const admins = await prisma.user.findMany({
    where: {
      schoolId,
      roles: { some: { key: { in: ["SUPER_ADMIN", "ADMIN"] } } },
    },
    orderBy: [{ status: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      lastLoginAt: true,
      roles: { select: { key: true, name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title={school.name}
        description={`/${school.slug}${school.board ? ` · ${school.board}` : ""}`}
        action={<AddSchoolAdmin schoolId={school.id} />}
      />

      <div className="mb-4">
        <Link href="/platform" className="text-xs font-medium text-brand">
          ← All schools
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Plan" value={school.plan.toLowerCase()} />
        <StatTile label="Students" value={String(school._count.students)} />
        <StatTile label="Staff" value={String(school._count.staff)} />
        <StatTile
          label="Status"
          value={school.isActive ? "Active" : "Inactive"}
          tone={school.isActive ? "success" : "danger"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Administrators"
          description="Super admins and admins for this school"
        />
        {admins.length === 0 ? (
          <EmptyState
            title="No administrators"
            description="Add one with the button above so the school can be managed."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Administrator</Th>
                <Th>Role</Th>
                <Th>Last signed in</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => {
                const roleKey = admin.roles.some((r) => r.key === "SUPER_ADMIN")
                  ? "SUPER_ADMIN"
                  : "ADMIN";
                return (
                  <tr key={admin.id} className="hover:bg-surface-hover">
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <Avatar firstName={admin.firstName} lastName={admin.lastName ?? ""} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {admin.firstName} {admin.lastName}
                          </span>
                          <span className="block truncate text-[11px] text-muted">{admin.email}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={roleKey === "SUPER_ADMIN" ? "brand" : "neutral"}>
                        {roleKey === "SUPER_ADMIN" ? "super admin" : "admin"}
                      </Badge>
                    </Td>
                    <Td className="text-muted-strong">
                      {admin.lastLoginAt ? formatDate(admin.lastLoginAt) : "never"}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[admin.status] ?? "neutral"}>
                        {admin.status.toLowerCase()}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <SchoolAdminActions
                        schoolId={school.id}
                        userId={admin.id}
                        userName={`${admin.firstName} ${admin.lastName ?? ""}`.trim()}
                        roleKey={roleKey}
                        status={admin.status}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        You manage only this school&rsquo;s administrators here. Those admins sign
        in to build out their own staff, classes and students.
      </p>
    </>
  );
}
