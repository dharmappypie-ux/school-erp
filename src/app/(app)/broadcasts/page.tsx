import { Composer } from "@/app/(app)/broadcasts/composer";
import {
  Alert,
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
import { formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Broadcasts" };

const STATUS_TONE: Record<string, Tone> = {
  QUEUED: "warning",
  SENDING: "info",
  SENT: "success",
  DELIVERED: "success",
  READ: "success",
  FAILED: "danger",
  BOUNCED: "danger",
};

export default async function BroadcastsPage() {
  const session = await requirePermission("notifications.send");
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;

  const [sections, recent, statusCounts, channelCounts, templates] =
    await Promise.all([
      yearId
        ? db.section.findMany({
            where: { academicYearId: yearId },
            orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
            select: { id: true, name: true, classLevel: { select: { name: true } } },
          })
        : [],
      db.notificationLog.findMany({
        where: { batchId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true, channel: true, recipient: true, subject: true, body: true,
          status: true, provider: true, errorMessage: true, createdAt: true,
          batchId: true,
        },
      }),
      db.notificationLog.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      db.notificationLog.groupBy({
        by: ["channel"],
        _count: { _all: true },
      }),
      db.notificationTemplate.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, key: true, channel: true, variables: true },
      }),
    ]);

  const byStatus = Object.fromEntries(
    statusCounts.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;
  const totalLogged = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

  // Group the log by batch so a 400-message send reads as one row, not 400.
  const batches = new Map<string, typeof recent>();
  for (const entry of recent) {
    const key = entry.batchId ?? entry.id;
    batches.set(key, [...(batches.get(key) ?? []), entry]);
  }

  const providersConfigured =
    Boolean(env.smtp.host) || Boolean(env.msg91.authKey) || Boolean(env.whatsapp.accessToken);

  return (
    <>
      <PageHeader
        title="Broadcasts"
        description="Message parents, students or staff across SMS, WhatsApp, email and the portal."
      />

      {!providersConfigured ? (
        <div className="mb-4">
          <Alert tone="info" title="No messaging provider configured">
            Messages are recorded in the delivery log and printed to the server
            console, but not transmitted. They are marked <strong>queued</strong>,
            never “sent”, so the log does not overstate what happened. Add SMTP,
            MSG91 or WhatsApp credentials to send for real.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Messages logged"
          value={String(totalLogged)}
          sublabel={`${batches.size} recent batches`}
        />
        <StatTile
          label="Sent"
          value={String((byStatus.SENT ?? 0) + (byStatus.DELIVERED ?? 0))}
          tone="success"
        />
        <StatTile
          label="Queued"
          value={String(byStatus.QUEUED ?? 0)}
          sublabel={providersConfigured ? "awaiting dispatch" : "no provider configured"}
          tone={(byStatus.QUEUED ?? 0) > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Failed"
          value={String((byStatus.FAILED ?? 0) + (byStatus.BOUNCED ?? 0))}
          tone={(byStatus.FAILED ?? 0) > 0 ? "danger" : "success"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Compose"
            description="Check the audience before sending"
          />
          <Composer
            sections={sections.map((section) => ({
              id: section.id,
              label: `${section.classLevel.name} ${section.name}`,
            }))}
          />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Channels in use" />
            {channelCounts.length === 0 ? (
              <EmptyState title="Nothing sent yet" />
            ) : (
              <ul className="divide-y divide-border">
                {channelCounts.map((row) => (
                  <li
                    key={row.channel}
                    className="flex items-center justify-between px-5 py-2.5"
                  >
                    <span className="text-sm">{row.channel.toLowerCase()}</span>
                    <span className="numeric text-xs text-muted">
                      {row._count._all} messages
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Templates"
              description="Used by automatic notifications"
            />
            {templates.length === 0 ? (
              <EmptyState title="No templates configured" />
            ) : (
              <ul className="divide-y divide-border">
                {templates.map((template) => (
                  <li key={template.id} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{template.name}</span>
                      <Badge tone="neutral">{template.channel.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-muted">
                      {template.key}
                      {template.variables.length > 0
                        ? ` · ${template.variables.join(", ")}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Delivery log"
          description="Grouped by batch, most recent first"
        />
        {batches.size === 0 ? (
          <EmptyState
            title="No broadcasts sent yet"
            description="Compose one above to see it here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sent</Th>
                <Th>Channel</Th>
                <Th>Message</Th>
                <Th className="text-right">Recipients</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {[...batches.entries()].map(([batchId, entries]) => {
                const first = entries[0];
                const failed = entries.filter(
                  (entry) => entry.status === "FAILED" || entry.status === "BOUNCED",
                ).length;
                const sent = entries.filter(
                  (entry) => entry.status === "SENT" || entry.status === "DELIVERED",
                ).length;

                return (
                  <tr key={batchId} className="hover:bg-surface-hover">
                    <Td className="text-muted-strong">
                      {formatDateTime(first.createdAt)}
                    </Td>
                    <Td>
                      <Badge tone="neutral">{first.channel.toLowerCase()}</Badge>
                      {first.provider ? (
                        <span className="block text-[11px] text-muted">
                          {first.provider}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      {first.subject ? (
                        <span className="block font-medium">{first.subject}</span>
                      ) : null}
                      <span className="block max-w-md truncate text-xs text-muted">
                        {first.body}
                      </span>
                    </Td>
                    <Td className="numeric text-right">{entries.length}</Td>
                    <Td>
                      {failed > 0 ? (
                        <Badge tone="danger">{failed} failed</Badge>
                      ) : sent > 0 ? (
                        <Badge tone="success">{sent} sent</Badge>
                      ) : (
                        <Badge tone={STATUS_TONE[first.status] ?? "neutral"}>
                          {first.status.toLowerCase()}
                        </Badge>
                      )}
                    </Td>
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
