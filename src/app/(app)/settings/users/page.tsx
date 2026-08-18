import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { FilterSelect, Pagination, SearchBox } from "@/components/data-controls";
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
import { formatDate } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Users & roles" };

const PAGE_SIZE = 25;

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  INVITED: "info",
  SUSPENDED: "danger",
  LOCKED: "danger",
  DISABLED: "neutral",
};

export default async function UsersPage({ searchParams }: PageProps<"/settings/users">) {
  const session = await requirePermission("users.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;

  const search = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" ? params.status : "";
  const roleKey = typeof params.role === "string" ? params.role : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.UserWhereInput = {
    ...(status ? { status: status as Prisma.EnumUserStatusFilter["equals"] } : {}),
    ...(roleKey ? { roles: { some: { key: roleKey } } } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, total, roles, byStatus] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ status: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { select: { key: true, name: true } },
        staff: { select: { id: true, employeeId: true, photoUrl: true } },
      },
    }),
    db.user.count({ where }),
    db.role.findMany({
      orderBy: { name: "asc" },
      select: { key: true, name: true, _count: { select: { users: true } } },
    }),
    db.user.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(
    byStatus.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;

  const neverSignedIn = users.filter((user) => !user.lastLoginAt).length;

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Every login issued for this school"
        action={
          <Link href="/settings" className="text-xs font-medium text-brand">
            Back to settings
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Users" value={String(total)} sublabel={`${roles.length} roles`} />
        <StatTile label="Active" value={String(counts.ACTIVE ?? 0)} tone="success" />
        <StatTile
          label="Suspended or locked"
          value={String((counts.SUSPENDED ?? 0) + (counts.LOCKED ?? 0))}
          tone={(counts.SUSPENDED ?? 0) + (counts.LOCKED ?? 0) > 0 ? "warning" : "success"}
        />
        <StatTile
          label="Never signed in"
          value={String(neverSignedIn)}
          sublabel="on this page"
          tone={neverSignedIn > 0 ? "warning" : "neutral"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Accounts"
          description={`${total} matching`}
          action={
            <span className="flex flex-wrap gap-2">
              <SearchBox placeholder="Name or email…" />
              <FilterSelect
                paramName="role"
                label="Role"
                allLabel="All roles"
                options={roles.map((role) => ({
                  value: role.key,
                  label: `${role.name} (${role._count.users})`,
                }))}
              />
              <FilterSelect
                paramName="status"
                label="Status"
                allLabel="All statuses"
                options={Object.keys(STATUS_TONE).map((value) => ({
                  value,
                  label: value.toLowerCase(),
                }))}
              />
            </span>
          }
        />

        {users.length === 0 ? (
          <EmptyState title="No users match" description="Try clearing the filters." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Roles</Th>
                  <Th>Contact</Th>
                  <Th>Last signed in</Th>
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
                          photoUrl={user.staff?.photoUrl}
                          size="sm"
                        />
                        <span className="min-w-0">
                          {user.staff ? (
                            <Link
                              href={`/staff/${user.staff.id}`}
                              className="block truncate font-medium hover:text-brand"
                            >
                              {user.firstName} {user.lastName}
                            </Link>
                          ) : (
                            <span className="block truncate font-medium">
                              {user.firstName} {user.lastName}
                            </span>
                          )}
                          <span className="block truncate text-[11px] text-muted">
                            {user.staff?.employeeId ?? "no staff record"}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {user.roles.length === 0 ? (
                          <Badge tone="warning">no role</Badge>
                        ) : (
                          user.roles.map((role) => (
                            <Badge key={role.key} tone="neutral">
                              {role.name}
                            </Badge>
                          ))
                        )}
                      </span>
                    </Td>
                    <Td className="text-muted-strong">
                      <span className="block truncate text-xs">{user.email}</span>
                      {user.phone ? (
                        <span className="block text-[11px] text-muted">{user.phone}</span>
                      ) : null}
                    </Td>
                    <Td className="text-muted-strong">
                      {user.lastLoginAt ? (
                        <>
                          {formatDate(user.lastLoginAt)}
                          <span className="block text-[11px] text-muted">
                            joined {formatDate(user.createdAt)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">never</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[user.status] ?? "neutral"}>
                        {user.status.toLowerCase()}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
              total={total}
            />
          </>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Roles" description="Permission sets and how many hold them" />
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th className="text-right">Users</Th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.key} className="hover:bg-surface-hover">
                <Td>
                  <span className="font-medium">{role.name}</span>
                  <span className="ml-2 font-mono text-[11px] text-muted">{role.key}</span>
                </Td>
                <Td className="numeric text-right">{role._count.users}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <p className="mt-3 text-xs text-muted">
        Accounts are read-only here. Creating a login, changing a role or
        resetting a password each need their own guarded flow rather than an
        inline edit — see the README for what is still to build.
      </p>
    </>
  );
}
