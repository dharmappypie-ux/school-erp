import Link from "next/link";
import { headers } from "next/headers";

import {
  AddDevice,
  DeviceActions,
  ProcessPunchesButton,
} from "@/app/(app)/attendance/devices/device-panels";
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
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDateTime, relativeDays } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Biometric devices" };

export default async function DevicesPage() {
  const session = await requirePermission("school.settings");
  const db = scopedDb(session.schoolId);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [devices, recentPunches, unmatchedCount, punchesToday] = await Promise.all([
    db.biometricDevice.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, serialNumber: true, deviceType: true,
        location: true, ipAddress: true, isActive: true, lastSeenAt: true,
        _count: { select: { punches: true } },
      },
    }),
    db.biometricPunch.findMany({
      orderBy: { punchedAt: "desc" },
      take: 20,
      select: {
        id: true, externalRef: true, punchedAt: true, direction: true, processed: true,
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
        staff: { select: { firstName: true, lastName: true, employeeId: true } },
        device: { select: { name: true } },
      },
    }),
    db.biometricPunch.count({ where: { processed: false } }),
    db.biometricPunch.count({ where: { punchedAt: { gte: startOfToday } } }),
  ]);

  const activeCount = devices.filter((d) => d.isActive).length;

  // Absolute ingest URL for copy-paste into the device config.
  const host = (await headers()).get("host") ?? "your-site";
  const ingestUrl = `https://${host}/api/biometric/punch`;

  return (
    <>
      <PageHeader
        title="Biometric devices"
        description="Readers that push attendance punches into the system"
        action={<AddDevice />}
      />

      <div className="mb-4">
        <Link href="/attendance" className="text-xs font-medium text-brand">
          ← Back to attendance
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Devices" value={String(devices.length)} sublabel={`${activeCount} active`} />
        <StatTile label="Punches today" value={String(punchesToday)} tone="info" />
        <StatTile
          label="Unmatched punches"
          value={String(unmatchedCount)}
          sublabel={unmatchedCount > 0 ? "need a matching admission/employee id" : "all matched"}
          tone={unmatchedCount > 0 ? "warning" : "success"}
        />
        <StatTile label="Attendance source" value="Biometric" sublabel="PRESENT on first punch" />
      </div>

      <Card className="mt-4">
        <CardHeader title="Devices" description={`${devices.length} registered`} />
        {devices.length === 0 ? (
          <EmptyState
            title="No devices registered"
            description="Register a reader with “Add device”, then set its API key and the URL below on the device."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Device</Th>
                <Th>Type</Th>
                <Th>Location</Th>
                <Th>Last seen</Th>
                <Th className="text-right">Punches</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-surface-hover">
                  <Td>
                    <span className="font-medium">{d.name}</span>
                    <span className="block font-mono text-[11px] text-muted">
                      {d.serialNumber}
                      {d.ipAddress ? ` · ${d.ipAddress}` : ""}
                    </span>
                  </Td>
                  <Td className="text-muted-strong">{d.deviceType.toLowerCase()}</Td>
                  <Td className="text-muted-strong">{d.location ?? "—"}</Td>
                  <Td className="text-muted-strong">
                    {d.lastSeenAt ? relativeDays(d.lastSeenAt) : "never"}
                  </Td>
                  <Td className="numeric text-right">{d._count.punches}</Td>
                  <Td>
                    <Badge tone={d.isActive ? "success" : "neutral"}>
                      {d.isActive ? "active" : "inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <DeviceActions deviceId={d.id} name={d.name} isActive={d.isActive} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Recent punches"
          description="Newest first — unmatched punches have no recognised admission/employee id"
          action={<ProcessPunchesButton />}
        />
        {recentPunches.length === 0 ? (
          <EmptyState title="No punches yet" description="Punches pushed by a device will appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Device</Th>
                <Th>Ref</Th>
                <Th>Matched to</Th>
                <Th>Dir</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {recentPunches.map((p) => {
                const person = p.student
                  ? `${p.student.firstName} ${p.student.lastName ?? ""} (${p.student.admissionNo})`
                  : p.staff
                    ? `${p.staff.firstName} ${p.staff.lastName ?? ""} (${p.staff.employeeId})`
                    : null;
                return (
                  <tr key={p.id} className="hover:bg-surface-hover">
                    <Td className="text-muted-strong">{formatDateTime(p.punchedAt)}</Td>
                    <Td className="text-muted-strong">{p.device.name}</Td>
                    <Td className="font-mono text-xs">{p.externalRef}</Td>
                    <Td className={person ? "text-muted-strong" : "text-warning"}>
                      {person ?? "unmatched"}
                    </Td>
                    <Td>
                      <Badge tone={p.direction === "IN" ? "success" : "neutral"}>
                        {p.direction.toLowerCase()}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={p.processed ? "success" : "warning"}>
                        {p.processed ? "processed" : "pending"}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="How devices connect" description="Point your reader at this endpoint" />
        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="text-muted-strong">
            Configure the device to POST punches to:
          </p>
          <pre className="overflow-x-auto rounded-[var(--radius-base)] bg-surface-muted px-3 py-2 font-mono text-xs">
            POST {ingestUrl}
          </pre>
          <p className="text-muted-strong">
            Authenticate with the serial number and the device&rsquo;s API key (header{" "}
            <code className="font-mono text-xs">x-device-key</code> or in the body). Enrol each
            person on the device under their <strong>admission number</strong> (students) or{" "}
            <strong>employee id</strong> (staff) — that&rsquo;s the <code className="font-mono text-xs">externalRef</code>.
          </p>
          <pre className="overflow-x-auto rounded-[var(--radius-base)] bg-surface-muted px-3 py-2 font-mono text-[11px] leading-relaxed">{`{
  "serialNumber": "ZK-1023",
  "key": "bmk_…",
  "punches": [
    { "externalRef": "GIS20260001", "punchedAt": "2026-10-03T08:55:00Z", "direction": "IN" }
  ]
}`}</pre>
          <p className="text-xs text-muted">
            A student&rsquo;s punch marks them <strong>PRESENT</strong> for the day (source:
            biometric). Punches whose id doesn&rsquo;t match anyone are kept as “unmatched” — fix the
            id and hit “Reprocess”.
          </p>
        </div>
      </Card>
    </>
  );
}
