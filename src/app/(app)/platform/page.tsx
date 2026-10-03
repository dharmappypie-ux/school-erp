import Link from "next/link";

import { AddSchool } from "@/app/(app)/platform/school-panels";
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

export const metadata = { title: "Schools" };

const PLAN_TONE: Record<string, Tone> = {
  TRIAL: "warning",
  BASIC: "info",
  STANDARD: "info",
  PREMIUM: "success",
  ENTERPRISE: "success",
};

export default async function PlatformPage() {
  // Cross-tenant: only a platform owner reaches this, and it reads every
  // school, so it deliberately uses raw Prisma rather than scopedDb.
  await requirePlatformAdmin();

  const schools = await prisma.school.findMany({
    where: { slug: { not: PLATFORM_WORKSPACE_SLUG } },
    orderBy: { createdAt: "desc" },
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
      currency: true,
      createdAt: true,
      _count: { select: { users: true, students: true, staff: true } },
    },
  });

  const activeCount = schools.filter((school) => school.isActive).length;
  const totalStudents = schools.reduce((sum, school) => sum + school._count.students, 0);

  return (
    <>
      <PageHeader
        title="Schools"
        description="Every tenant on the platform"
        action={<AddSchool />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Schools" value={String(schools.length)} sublabel={`${activeCount} active`} />
        <StatTile label="Students, all schools" value={String(totalStudents)} />
        <StatTile
          label="Staff, all schools"
          value={String(schools.reduce((sum, school) => sum + school._count.staff, 0))}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title="All schools" description={`${schools.length} tenant(s)`} />
        {schools.length === 0 ? (
          <EmptyState
            title="No schools yet"
            description="Use “Add school” to create the first tenant."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>School</Th>
                <Th>Location</Th>
                <Th>Plan</Th>
                <Th className="text-right">Students</Th>
                <Th className="text-right">Staff</Th>
                <Th>Created</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr key={school.id} className="hover:bg-surface-hover">
                  <Td>
                    <Link
                      href={`/platform/${school.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {school.name}
                    </Link>
                    <span className="block font-mono text-[11px] text-muted">
                      /{school.slug}
                      {school.code ? ` · ${school.code}` : ""}
                      {school.board ? ` · ${school.board}` : ""}
                    </span>
                  </Td>
                  <Td className="text-muted-strong">
                    {[school.city, school.state].filter(Boolean).join(", ") || "—"}
                  </Td>
                  <Td>
                    <Badge tone={PLAN_TONE[school.plan] ?? "neutral"}>
                      {school.plan.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td className="numeric text-right">{school._count.students}</Td>
                  <Td className="numeric text-right">{school._count.staff}</Td>
                  <Td className="text-muted-strong">{formatDate(school.createdAt)}</Td>
                  <Td>
                    <Badge tone={school.isActive ? "success" : "danger"}>
                      {school.isActive ? "active" : "inactive"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        Creating a school sets up its roles, current academic year and first
        super-admin. That admin signs in with the one-time password and adds
        their own staff, classes and students — the internal data of a school
        is never managed from here.
      </p>
    </>
  );
}
