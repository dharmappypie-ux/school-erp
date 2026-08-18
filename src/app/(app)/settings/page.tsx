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
import { requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Settings" };

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  INVITED: "info",
  SUSPENDED: "danger",
  LOCKED: "danger",
  DISABLED: "neutral",
};

export default async function SettingsPage() {
  const session = await requirePermission("settings.read");
  const db = scopedDb(session.schoolId);
  const canAudit = hasPermission(session.permissions, "audit.read");

  const [school, roles, users, years, audit, userCount] = await Promise.all([
    db.school.findUnique({
      where: { id: session.schoolId },
      select: {
        name: true, slug: true, code: true, email: true, phone: true,
        addressLine1: true, city: true, state: true, currency: true,
        timezone: true, locale: true, isActive: true, createdAt: true,
      },
    }),
    db.role.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, key: true, name: true, description: true,
        permissions: true, isSystem: true,
        _count: { select: { users: true } },
      },
    }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, firstName: true, lastName: true, email: true,
        status: true, lastLoginAt: true,
        roles: { select: { name: true } },
      },
    }),
    db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true, name: true, startDate: true, endDate: true, isCurrent: true,
        _count: { select: { sections: true } },
      },
    }),
    canAudit
      ? db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true, action: true, entityType: true, createdAt: true,
            user: { select: { firstName: true, lastName: true } },
          },
        })
      : [],
    db.user.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="School profile, roles, users and history"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Users" value={String(userCount)} sublabel={`${roles.length} roles`} />
        <StatTile
          label="Academic years"
          value={String(years.length)}
          sublabel={years.find((y) => y.isCurrent)?.name ?? "none marked current"}
        />
        <StatTile label="Currency" value={school?.currency ?? "—"} sublabel={school?.timezone ?? ""} />
        <StatTile
          label="School status"
          value={school?.isActive ? "Active" : "Inactive"}
          tone={school?.isActive ? "success" : "danger"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="School profile" description="Identity used across the app" />
          {!school ? (
            <EmptyState title="School not found" />
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-sm">
              {[
                ["Name", school.name],
                ["Code", school.code],
                ["Slug", school.slug],
                ["Email", school.email ?? "—"],
                ["Phone", school.phone ?? "—"],
                ["City", [school.city, school.state].filter(Boolean).join(", ") || "—"],
                ["Address", school.addressLine1 ?? "—"],
                ["Locale", school.locale],
                ["Created", formatDate(school.createdAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            These fields are read-only here. Editing them changes identifiers
            used by invoices, admission numbers and login, so it is deliberately
            not a one-click action.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Academic years"
            description="One is current at a time"
          />
          {years.length === 0 ? (
            <EmptyState title="No academic years" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Year</Th>
                  <Th>Runs</Th>
                  <Th className="text-right">Sections</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year.id}>
                    <Td className="font-medium">{year.name}</Td>
                    <Td className="text-muted-strong">
                      {formatDate(year.startDate)} – {formatDate(year.endDate)}
                    </Td>
                    <Td className="numeric text-right">{year._count.sections}</Td>
                    <Td>
                      {year.isCurrent ? <Badge tone="success">current</Badge> : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Roles"
          description="Permission sets assigned to users"
        />
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th className="text-right">Users</Th>
              <Th className="text-right">Permissions</Th>
              <Th>Type</Th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="hover:bg-surface-hover">
                <Td>
                  <span className="font-medium">{role.name}</span>
                  <span className="block text-[11px] text-muted">
                    {role.description ?? role.key}
                  </span>
                </Td>
                <Td className="numeric text-right">{role._count.users}</Td>
                <Td className="numeric text-right">
                  {role.permissions.includes("*") ? "all" : role.permissions.length}
                </Td>
                <Td>
                  {role.isSystem ? (
                    <Badge tone="neutral">system</Badge>
                  ) : (
                    <Badge tone="info">custom</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Users" description="25 most recently created" />
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Roles</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-surface-hover">
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Avatar
                        firstName={user.firstName}
                        lastName={user.lastName ?? ""}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {user.firstName} {user.lastName}
                        </span>
                        <span className="block truncate text-[11px] text-muted">
                          {user.email}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td className="text-[11px] text-muted-strong">
                    {user.roles.map((role) => role.name).join(", ") || "—"}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[user.status] ?? "neutral"}>
                      {user.status.toLowerCase()}
                    </Badge>
                    {user.lastLoginAt ? (
                      <span className="block text-[11px] text-muted">
                        {formatDate(user.lastLoginAt)}
                      </span>
                    ) : (
                      <span className="block text-[11px] text-muted">never signed in</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Audit log"
            description={canAudit ? "20 most recent actions" : undefined}
          />
          {!canAudit ? (
            <EmptyState
              title="Not visible to you"
              description="Viewing the audit log needs the audit.read permission."
            />
          ) : audit.length === 0 ? (
            <EmptyState title="Nothing recorded yet" />
          ) : (
            <ul className="divide-y divide-border">
              {audit.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs">{entry.action}</span>
                    <span className="block text-[11px] text-muted">
                      {entry.entityType ?? "—"}
                      {entry.user ? ` · ${entry.user.firstName} ${entry.user.lastName ?? ""}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
