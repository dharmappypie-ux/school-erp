import Link from "next/link";

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
import { formatDateTime, relativeDays } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 40;

/** Actions that change or remove data read louder than ones that only add. */
function toneFor(action: string): Tone {
  if (/delete|remove|withdraw|revoke|cancel/.test(action)) return "danger";
  if (/update|edit|approve|reject|decide|grade|publish/.test(action)) return "warning";
  if (/create|add|attach|issue|collect|generate/.test(action)) return "success";
  return "neutral";
}

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const session = await requirePermission("audit.read");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;

  const search = typeof params.q === "string" ? params.q.trim() : "";
  const entity = typeof params.entity === "string" ? params.entity : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(entity ? { entityType: entity } : {}),
    ...(search
      ? {
          OR: [
            { action: { contains: search, mode: "insensitive" } },
            { entityId: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000);

  const [entries, total, entityTypes, todayCount, actorCount] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entityType"], _count: { _all: true } }),
    db.auditLog.count({ where: { createdAt: { gte: dayAgo } } }),
    db.auditLog.findMany({
      where: { createdAt: { gte: dayAgo } },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);

  const types = entityTypes
    .filter((row): row is typeof row & { entityType: string } => Boolean(row.entityType))
    .sort((a, b) => b._count._all - a._count._all);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, and when"
        action={
          <Link href="/settings" className="text-xs font-medium text-brand">
            Back to settings
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Entries" value={String(total)} sublabel="matching your filters" />
        <StatTile label="Last 24 hours" value={String(todayCount)} />
        <StatTile label="Active accounts" value={String(actorCount.length)} sublabel="in the last 24 hours" />
        <StatTile label="Record types" value={String(types.length)} />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Activity"
          description="Most recent first"
          action={
            <span className="flex flex-wrap gap-2">
              <SearchBox placeholder="Action or record id…" />
              <FilterSelect
                paramName="entity"
                label="Record type"
                allLabel="All types"
                options={types.map((row) => ({
                  value: row.entityType,
                  label: `${row.entityType} (${row._count._all})`,
                }))}
              />
            </span>
          }
        />

        {entries.length === 0 ? (
          <EmptyState
            title="Nothing recorded"
            description={
              search || entity
                ? "No entries match those filters."
                : "Actions are written here as people use the app."
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Action</Th>
                  <Th>Record</Th>
                  <Th>By</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-surface-hover">
                    <Td>
                      <Badge tone={toneFor(entry.action)}>{entry.action}</Badge>
                    </Td>
                    <Td className="text-muted-strong">
                      {entry.entityType ?? <span className="text-muted">—</span>}
                      {entry.entityId ? (
                        <span className="block max-w-[16rem] truncate font-mono text-[11px] text-muted">
                          {entry.entityId}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-muted-strong">
                      {entry.user ? (
                        <>
                          {entry.user.firstName} {entry.user.lastName}
                          <span className="block truncate text-[11px] text-muted">
                            {entry.user.email}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">system</span>
                      )}
                      {entry.ipAddress ? (
                        <span className="block font-mono text-[11px] text-muted">
                          {entry.ipAddress}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-muted-strong">
                      {formatDateTime(entry.createdAt)}
                      <span className="block text-[11px] text-muted">
                        {relativeDays(entry.createdAt)}
                      </span>
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

      <p className="mt-3 text-xs text-muted">
        The log is append-only and is never edited from the app — an audit trail
        that can be tidied up is not an audit trail.
      </p>
    </>
  );
}
