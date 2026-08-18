import Link from "next/link";
import { notFound } from "next/navigation";

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
import { formatDate, formatDateTime, formatMoney, initials, toNumber } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";
import {
  haversineKm,
  routeOccupancy,
  trackingFreshness,
  vehicleCompliance,
  worstCompliance,
  type ComplianceState,
} from "@/lib/transport";

export const metadata = { title: "Route" };

const COMPLIANCE_TONE: Record<ComplianceState, Tone> = {
  VALID: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  UNKNOWN: "neutral",
};

/**
 * Plots the vehicle trail and stops on a plain SVG.
 *
 * A real map tile layer would need an external host, which this deployment
 * cannot assume; normalising the coordinates into a local viewBox still shows
 * the shape of the route and where the bus is along it.
 */
function TrackMap({
  stops,
  trail,
}: {
  stops: { name: string; lat: number; lng: number }[];
  trail: { lat: number; lng: number }[];
}) {
  const points = [...stops, ...trail];
  if (points.length < 2) return null;

  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Guard against a zero-size bounding box when every point coincides.
  const spanLat = maxLat - minLat || 0.001;
  const spanLng = maxLng - minLng || 0.001;
  const pad = 8;
  const width = 600;
  const height = 260;

  const project = (point: { lat: number; lng: number }) => ({
    x: pad + ((point.lng - minLng) / spanLng) * (width - pad * 2),
    // Latitude grows northwards but SVG y grows downwards.
    y: pad + (1 - (point.lat - minLat) / spanLat) * (height - pad * 2),
  });

  const trailPath = trail
    .map((point, index) => {
      const { x, y } = project(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const current = trail.length > 0 ? project(trail[trail.length - 1]) : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Route stops and recent vehicle positions"
    >
      <rect width={width} height={height} rx="8" fill="var(--surface-muted)" />

      {trailPath ? (
        <path
          d={trailPath}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeDasharray="4 3"
          opacity="0.7"
        />
      ) : null}

      {stops.map((stop, index) => {
        const { x, y } = project(stop);
        return (
          <g key={`${stop.name}-${index}`}>
            <circle cx={x} cy={y} r="5" fill="var(--info)" />
            <text
              x={x + 8}
              y={y + 3}
              fontSize="9"
              fill="var(--muted-strong)"
            >
              {stop.name}
            </text>
          </g>
        );
      })}

      {current ? (
        <g>
          <circle cx={current.x} cy={current.y} r="8" fill="var(--brand)" opacity="0.25" />
          <circle cx={current.x} cy={current.y} r="4.5" fill="var(--brand)" />
        </g>
      ) : null}
    </svg>
  );
}

export default async function RoutePage({
  params,
}: PageProps<"/transport/routes/[id]">) {
  const session = await requirePermission("transport.read");
  const db = scopedDb(session.schoolId);
  const { id } = await params;
  const yearId = session.academicYear?.id;
  const currency = session.school.currency;

  const route = await db.route.findUnique({
    where: { id },
    include: {
      stops: { orderBy: { sequence: "asc" } },
      vehicle: {
        include: {
          pings: { orderBy: { recordedAt: "desc" }, take: 20 },
        },
      },
      assignments: {
        where: { isActive: true, ...(yearId ? { academicYearId: yearId } : {}) },
        include: {
          stop: { select: { id: true, name: true, sequence: true } },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              enrollments: {
                where: yearId ? { academicYearId: yearId } : undefined,
                take: 1,
                select: {
                  section: {
                    select: { name: true, classLevel: { select: { name: true } } },
                  },
                },
              },
              guardians: {
                where: { isPrimary: true },
                take: 1,
                select: { guardian: { select: { phone: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!route) notFound();

  const occupancy = routeOccupancy(
    route.assignments.length,
    route.vehicle?.capacity ?? 0,
  );
  const compliance = route.vehicle ? vehicleCompliance(route.vehicle) : [];
  const complianceState = compliance.length ? worstCompliance(compliance) : "UNKNOWN";

  // Pings arrive newest-first; the trail reads oldest to newest.
  const pings = [...(route.vehicle?.pings ?? [])].reverse();
  const trail = pings.map((ping) => ({
    lat: toNumber(ping.latitude),
    lng: toNumber(ping.longitude),
  }));
  const lastPing = route.vehicle?.pings[0] ?? null;
  const freshness = trackingFreshness(lastPing?.recordedAt ?? null);

  const trailDistance = trail.reduce(
    (sum, point, index) =>
      index === 0 ? 0 : sum + haversineKm(trail[index - 1], point),
    0,
  );

  const mapStops = route.stops
    .filter((stop) => stop.latitude !== null && stop.longitude !== null)
    .map((stop) => ({
      name: stop.name,
      lat: toNumber(stop.latitude),
      lng: toNumber(stop.longitude),
    }));

  // Riders grouped by boarding point, in route order.
  const byStop = new Map<string, typeof route.assignments>();
  for (const assignment of route.assignments) {
    const key = assignment.stop.id;
    byStop.set(key, [...(byStop.get(key) ?? []), assignment]);
  }

  return (
    <>
      <PageHeader
        title={route.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {route.code ? <span className="font-mono">{route.code}</span> : null}
            <span>·</span>
            <span>{route.stops.length} stops</span>
            {route.distanceKm ? (
              <>
                <span>·</span>
                <span>{toNumber(route.distanceKm)} km</span>
              </>
            ) : null}
            <Badge tone={route.isActive ? "success" : "neutral"}>
              {route.isActive ? "active" : "inactive"}
            </Badge>
          </span>
        }
        action={
          <Link
            href="/transport"
            className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
          >
            Back to transport
          </Link>
        }
      />

      {occupancy.state === "OVERLOADED" ? (
        <div className="mb-4">
          <Alert tone="danger" title="Over capacity">
            {occupancy.assigned} children are assigned to a vehicle with{" "}
            {occupancy.capacity} seats.
          </Alert>
        </div>
      ) : null}

      {complianceState === "EXPIRED" ? (
        <div className="mb-4">
          <Alert tone="danger" title="Vehicle not road-legal">
            {compliance
              .filter((item) => item.state === "EXPIRED")
              .map((item) => `${item.label} expired ${formatDate(item.expiresAt)}`)
              .join("; ")}
            .
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Riders"
          value={String(occupancy.assigned)}
          sublabel={`${occupancy.seatsLeft} seats left of ${occupancy.capacity}`}
          tone={
            occupancy.state === "OVERLOADED" ? "danger"
            : occupancy.state === "NEARLY_FULL" ? "warning"
            : "success"
          }
        />
        <StatTile
          label="Vehicle"
          value={route.vehicle?.registrationNo ?? "—"}
          sublabel={route.vehicle?.driverName ?? "no driver recorded"}
        />
        <StatTile
          label="Tracker"
          value={
            freshness.state === "NO_SIGNAL" ? "No signal" : `${freshness.minutesAgo}m ago`
          }
          sublabel={
            lastPing ? `${toNumber(lastPing.speedKmph)} km/h at last ping` : "never reported"
          }
          tone={
            freshness.state === "LIVE" ? "success"
            : freshness.state === "RECENT" ? "info"
            : freshness.state === "STALE" ? "warning"
            : "neutral"
          }
        />
        <StatTile
          label="Compliance"
          value={complianceState.toLowerCase()}
          sublabel={`${compliance.filter((item) => item.state === "VALID").length} of 3 certificates valid`}
          tone={COMPLIANCE_TONE[complianceState]}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Live position"
            description={
              lastPing
                ? `Last reported ${formatDateTime(lastPing.recordedAt)} · ${trailDistance.toFixed(1)} km covered in the recent trail`
                : "No tracker data for this vehicle"
            }
          />
          <div className="px-5 py-4">
            {trail.length === 0 && mapStops.length === 0 ? (
              <EmptyState
                title="Nothing to plot"
                description="Stops have no coordinates and the vehicle has not reported a position."
              />
            ) : (
              <>
                <TrackMap stops={mapStops} trail={trail} />
                {freshness.state === "STALE" || freshness.state === "NO_SIGNAL" ? (
                  <p className="mt-2 text-xs text-warning">
                    This is the last known position, not a live one — the tracker
                    has not reported recently.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Stops" description="In pickup order" />
          {route.stops.length === 0 ? (
            <EmptyState title="No stops on this route" />
          ) : (
            <ol className="divide-y divide-border">
              {route.stops.map((stop) => (
                <li key={stop.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="numeric mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
                    {stop.sequence}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{stop.name}</p>
                    <p className="text-xs text-muted">
                      {stop.pickupTime ? `pickup ${stop.pickupTime}` : ""}
                      {stop.dropTime ? ` · drop ${stop.dropTime}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="numeric block text-xs font-medium">
                      {(byStop.get(stop.id) ?? []).length}
                    </span>
                    {stop.monthlyFare ? (
                      <span className="block text-[11px] text-muted">
                        {formatMoney(stop.monthlyFare, currency)}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Riders"
          description={`${route.assignments.length} students, grouped by boarding point`}
        />
        {route.assignments.length === 0 ? (
          <EmptyState title="No students assigned to this route" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Class</Th>
                <Th>Stop</Th>
                <Th>Direction</Th>
                <Th>Guardian</Th>
              </tr>
            </thead>
            <tbody>
              {route.stops.flatMap((stop) =>
                (byStop.get(stop.id) ?? []).map((assignment) => {
                  const enrollment = assignment.student.enrollments[0];
                  return (
                    <tr key={assignment.id} className="hover:bg-surface-hover">
                      <Td>
                        <Link
                          href={`/students/${assignment.student.id}`}
                          className="flex items-center gap-2.5"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand">
                            {initials(
                              assignment.student.firstName,
                              assignment.student.lastName,
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:text-brand">
                              {assignment.student.firstName} {assignment.student.lastName}
                            </span>
                            <span className="block font-mono text-[11px] text-muted">
                              {assignment.student.admissionNo}
                            </span>
                          </span>
                        </Link>
                      </Td>
                      <Td className="text-muted-strong">
                        {enrollment
                          ? `${enrollment.section.classLevel.name} ${enrollment.section.name}`
                          : "—"}
                      </Td>
                      <Td className="text-muted-strong">
                        <span className="numeric text-muted">{stop.sequence}.</span>{" "}
                        {stop.name}
                      </Td>
                      <Td>
                        <Badge tone="neutral">
                          {assignment.direction.toLowerCase()}
                        </Badge>
                      </Td>
                      <Td className="text-muted-strong">
                        {assignment.student.guardians[0]?.guardian.phone ?? "—"}
                      </Td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
