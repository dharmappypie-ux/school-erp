import Link from "next/link";

import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
  Table,
  Td,
  Th,
  type Tone,
} from "@/components/ui";
import { AddRoute, AddVehicle } from "@/app/(app)/transport/manage-panels";
import { requirePermission } from "@/lib/auth";
import { formatDate, toNumber } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";
import {
  routeOccupancy,
  trackingFreshness,
  vehicleCompliance,
  worstCompliance,
  type ComplianceState,
  type OccupancyState,
} from "@/lib/transport";

export const metadata = { title: "Transport" };

const COMPLIANCE_TONE: Record<ComplianceState, Tone> = {
  VALID: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  UNKNOWN: "neutral",
};

const OCCUPANCY_TONE: Record<OccupancyState, Tone> = {
  EMPTY: "neutral",
  HEALTHY: "success",
  NEARLY_FULL: "warning",
  OVERLOADED: "danger",
};

export default async function TransportPage() {
  const session = await requirePermission("transport.read");
  const db = scopedDb(session.schoolId);
  const canManage = hasPermission(session.permissions, "transport.manage");
  const yearId = session.academicYear?.id;
  const currency = session.school.currency;

  const [vehicles, routes, assignedTotal] = await Promise.all([
    db.vehicle.findMany({
      orderBy: { registrationNo: "asc" },
      select: {
        id: true,
        registrationNo: true,
        model: true,
        capacity: true,
        vehicleType: true,
        isActive: true,
        driverName: true,
        driverPhone: true,
        insuranceExpiry: true,
        fitnessExpiry: true,
        pollutionExpiry: true,
        lastServicedAt: true,
        pings: {
          orderBy: { recordedAt: "desc" },
          take: 1,
          select: { recordedAt: true, speedKmph: true },
        },
        routes: { select: { id: true, name: true } },
      },
    }),
    db.route.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        distanceKm: true,
        isActive: true,
        vehicle: { select: { registrationNo: true, capacity: true } },
        _count: {
          select: {
            stops: true,
            assignments: { where: { isActive: true, ...(yearId ? { academicYearId: yearId } : {}) } },
          },
        },
      },
    }),
    db.transportAssignment.count({
      where: { isActive: true, ...(yearId ? { academicYearId: yearId } : {}) },
    }),
  ]);

  const complianceByVehicle = vehicles.map((vehicle) => ({
    vehicle,
    items: vehicleCompliance(vehicle),
  }));
  const expired = complianceByVehicle.filter(
    (entry) => worstCompliance(entry.items) === "EXPIRED",
  );
  const expiring = complianceByVehicle.filter(
    (entry) => worstCompliance(entry.items) === "EXPIRING",
  );

  const occupancies = routes.map((route) => ({
    route,
    occupancy: routeOccupancy(
      route._count.assignments,
      route.vehicle?.capacity ?? 0,
    ),
  }));
  const overloaded = occupancies.filter(
    (entry) => entry.occupancy.state === "OVERLOADED",
  );

  const totalCapacity = routes.reduce(
    (sum, route) => sum + (route.vehicle?.capacity ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Transport"
        description={`${vehicles.length} vehicles · ${routes.length} routes · ${assignedTotal} students`}
      />

      {expired.length > 0 ? (
        <div className="mb-4">
          <Alert tone="danger" title={`${expired.length} vehicle(s) not road-legal`}>
            {expired
              .map((entry) => entry.vehicle.registrationNo)
              .join(", ")}{" "}
            {expired.length === 1 ? "has" : "have"} an expired certificate.
            Running these is an offence and voids insurance cover for the
            children on board.
          </Alert>
        </div>
      ) : null}

      {overloaded.length > 0 ? (
        <div className="mb-4">
          <Alert tone="danger" title={`${overloaded.length} route(s) over capacity`}>
            {overloaded
              .map(
                (entry) =>
                  `${entry.route.name} (${entry.occupancy.assigned} of ${entry.occupancy.capacity} seats)`,
              )
              .join("; ")}
            . More children are assigned than there are seats.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Students transported"
          value={String(assignedTotal)}
          sublabel={`${totalCapacity} seats across the fleet`}
          tone={assignedTotal > totalCapacity ? "danger" : "success"}
        />
        <StatTile
          label="Active vehicles"
          value={String(vehicles.filter((vehicle) => vehicle.isActive).length)}
          sublabel={`${vehicles.length} in the fleet`}
        />
        <StatTile
          label="Certificates expiring"
          value={String(expiring.length)}
          sublabel="within 30 days"
          tone={expiring.length > 0 ? "warning" : "success"}
        />
        <StatTile
          label="Expired"
          value={String(expired.length)}
          sublabel={expired.length > 0 ? "do not run" : "fleet is legal"}
          tone={expired.length > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title="Routes" description="Seat usage and stops" />
        {routes.length === 0 ? (
          <EmptyState title="No routes configured" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Route</Th>
                <Th>Vehicle</Th>
                <Th className="text-right">Stops</Th>
                <Th className="text-right">Distance</Th>
                <Th className="w-48">Occupancy</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {occupancies.map(({ route, occupancy }) => (
                <tr key={route.id} className="hover:bg-surface-hover">
                  <Td>
                    <Link
                      href={`/transport/routes/${route.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {route.name}
                    </Link>
                    {route.code ? (
                      <span className="block font-mono text-[11px] text-muted">
                        {route.code}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-muted-strong">
                    {route.vehicle?.registrationNo ?? "unassigned"}
                  </Td>
                  <Td className="numeric text-right">{route._count.stops}</Td>
                  <Td className="numeric text-right text-muted-strong">
                    {route.distanceKm ? `${toNumber(route.distanceKm)} km` : "—"}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={Math.min(100, occupancy.percent)}
                        tone={OCCUPANCY_TONE[occupancy.state]}
                      />
                      <span className="numeric shrink-0 text-[11px] text-muted">
                        {occupancy.assigned}/{occupancy.capacity}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={OCCUPANCY_TONE[occupancy.state]}>
                      {occupancy.state.replace("_", " ").toLowerCase()}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Fleet"
          description="Documents, driver and last known position"
        />
        {vehicles.length === 0 ? (
          <EmptyState title="No vehicles in the fleet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Vehicle</Th>
                <Th>Driver</Th>
                <Th className="text-right">Capacity</Th>
                <Th>Insurance</Th>
                <Th>Fitness</Th>
                <Th>Pollution</Th>
                <Th>Tracker</Th>
              </tr>
            </thead>
            <tbody>
              {complianceByVehicle.map(({ vehicle, items }) => {
                const freshness = trackingFreshness(vehicle.pings[0]?.recordedAt ?? null);
                return (
                  <tr key={vehicle.id} className="hover:bg-surface-hover">
                    <Td>
                      <span className="font-mono text-xs font-medium">
                        {vehicle.registrationNo}
                      </span>
                      <span className="block text-xs text-muted">
                        {vehicle.model ?? vehicle.vehicleType}
                        {vehicle.routes[0] ? ` · ${vehicle.routes[0].name}` : ""}
                      </span>
                    </Td>
                    <Td className="text-muted-strong">
                      {vehicle.driverName ?? "—"}
                      {vehicle.driverPhone ? (
                        <span className="block text-xs text-muted">
                          {vehicle.driverPhone}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="numeric text-right">{vehicle.capacity}</Td>
                    {items.map((item) => (
                      <Td key={item.key}>
                        <Badge tone={COMPLIANCE_TONE[item.state]}>
                          {item.state === "UNKNOWN"
                            ? "not recorded"
                            : item.state === "EXPIRED"
                              ? `expired ${Math.abs(item.daysRemaining ?? 0)}d ago`
                              : formatDate(item.expiresAt)}
                        </Badge>
                      </Td>
                    ))}
                    <Td>
                      <Badge
                        tone={
                          freshness.state === "LIVE" ? "success"
                          : freshness.state === "RECENT" ? "info"
                          : freshness.state === "STALE" ? "warning"
                          : "neutral"
                        }
                      >
                        {freshness.state === "NO_SIGNAL"
                          ? "no signal"
                          : `${freshness.minutesAgo}m ago`}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        Certificates are flagged 30 days before they lapse. A vehicle with no
        recorded expiry date is shown as “not recorded” rather than valid.
        Fares are set per stop and shown in {currency}.
      </p>
      {canManage ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <AddVehicle />
          <AddRoute
            vehicles={vehicles.map((vehicle) => ({
              value: vehicle.id,
              label: `${vehicle.registrationNo}${vehicle.model ? ` · ${vehicle.model}` : ""}`,
            }))}
          />
        </div>
      ) : null}

    </>
  );
}
