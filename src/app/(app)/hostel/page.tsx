import { AddBlock, AddRoom, AllocateRoom } from "@/app/(app)/hostel/manage-panels";
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
  cn,
  type Tone,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, initials } from "@/lib/format";
import {
  canAllocate,
  occupancyOf,
  type Gender,
  type HostelType,
  type OccupancyState,
} from "@/lib/hostel";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Hostel" };

const OCCUPANCY_TONE: Record<OccupancyState, Tone> = {
  EMPTY: "neutral",
  AVAILABLE: "success",
  FULL: "warning",
  OVER_CAPACITY: "danger",
};

export default async function HostelPage() {
  const session = await requirePermission("hostel.read");
  const db = scopedDb(session.schoolId);
  const canManage = hasPermission(session.permissions, "hostel.manage");

  // Option lists for the panels: only rooms with a free bed are offered, and
  // only students who are not already housed.
  const [panelBlocks, panelRooms, unhousedStudents, possibleWardens] = canManage
    ? await Promise.all([
        db.hostel.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true, type: true },
        }),
        // tenant-safe: rooms are reached through their block's schoolId.
        db.hostelRoom.findMany({
          where: { isActive: true, hostel: { schoolId: session.schoolId } },
          orderBy: [{ hostel: { name: "asc" } }, { roomNumber: "asc" }],
          select: {
            id: true,
            roomNumber: true,
            capacity: true,
            hostel: { select: { name: true, type: true } },
            _count: { select: { allocations: { where: { isActive: true } } } },
          },
        }),
        db.student.findMany({
          where: {
            status: "ACTIVE",
            deletedAt: null,
            hostelAllocations: { none: { isActive: true } },
          },
          orderBy: { firstName: "asc" },
          take: 400,
          select: { id: true, firstName: true, lastName: true, admissionNo: true, gender: true },
        }),
        db.staffMember.findMany({
          where: { employmentStatus: "ACTIVE", deletedAt: null },
          orderBy: { firstName: "asc" },
          take: 200,
          select: { id: true, firstName: true, lastName: true },
        }),
      ])
    : [[], [], [], []];

  const roomsWithSpace = panelRooms.filter(
    (room) => room._count.allocations < room.capacity,
  );
  const yearId = session.academicYear?.id;
  const currency = session.school.currency;

  const hostels = await db.hostel.findMany({
    orderBy: { name: "asc" },
    include: {
      warden: { select: { firstName: true, lastName: true, phone: true } },
      rooms: {
        orderBy: { roomNumber: "asc" },
        include: {
          allocations: {
            where: { isActive: true, ...(yearId ? { academicYearId: yearId } : {}) },
            include: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  admissionNo: true,
                  gender: true,
                  enrollments: {
                    where: yearId ? { academicYearId: yearId } : undefined,
                    take: 1,
                    select: {
                      section: {
                        select: { name: true, classLevel: { select: { name: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Any resident sitting in a block that does not match their gender is a
  // safeguarding issue, so it is checked on render rather than trusted.
  const misplaced = hostels.flatMap((hostel) =>
    hostel.rooms.flatMap((room) =>
      room.allocations
        .filter(
          (allocation) =>
            !canAllocate(
              { gender: allocation.student.gender as Gender | null },
              { type: hostel.type as HostelType },
            ).allowed,
        )
        .map((allocation) => ({ hostel, room, allocation })),
    ),
  );

  const blocks = hostels.map((hostel) => {
    const beds = hostel.rooms.reduce((sum, room) => sum + room.capacity, 0);
    const residents = hostel.rooms.reduce(
      (sum, room) => sum + room.allocations.length,
      0,
    );
    return { hostel, occupancy: occupancyOf(residents, beds) };
  });

  const totalBeds = blocks.reduce((sum, block) => sum + block.occupancy.capacity, 0);
  const totalResidents = blocks.reduce(
    (sum, block) => sum + block.occupancy.occupied,
    0,
  );
  const overall = occupancyOf(totalResidents, totalBeds);

  if (hostels.length === 0) {
    return (
      <>
        <PageHeader title="Hostel" />
        <EmptyState
          title="No hostel blocks configured"
          description="This school has no boarding facilities on record."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Hostel"
        description={`${hostels.length} blocks · ${totalResidents} residents in ${totalBeds} beds`}
      />

      {misplaced.length > 0 ? (
        <div className="mb-4">
          <Alert
            tone="danger"
            title={`${misplaced.length} resident(s) in the wrong block`}
          >
            {misplaced
              .slice(0, 4)
              .map(
                (entry) =>
                  `${entry.allocation.student.firstName} ${entry.allocation.student.lastName ?? ""} (${entry.allocation.student.gender?.toLowerCase() ?? "no gender on file"}) in ${entry.hostel.name}`,
              )
              .join("; ")}
            {misplaced.length > 4 ? ` and ${misplaced.length - 4} more` : ""}. These
            placements need reviewing.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Residents"
          value={String(totalResidents)}
          sublabel={`${overall.bedsFree} beds free`}
          tone={OCCUPANCY_TONE[overall.state]}
        />
        <StatTile
          label="Occupancy"
          value={`${overall.percent}%`}
          sublabel={`${totalBeds} beds across ${hostels.reduce((sum, h) => sum + h.rooms.length, 0)} rooms`}
          tone={overall.percent >= 90 ? "warning" : "success"}
        />
        <StatTile
          label="Blocks"
          value={String(hostels.length)}
          sublabel={hostels.map((hostel) => hostel.type.toLowerCase()).join(", ")}
        />
        <StatTile
          label="Placement issues"
          value={String(misplaced.length)}
          sublabel={misplaced.length > 0 ? "review required" : "all placements valid"}
          tone={misplaced.length > 0 ? "danger" : "success"}
        />
      </div>

      {blocks.map(({ hostel, occupancy }) => (
        <Card key={hostel.id} className="mt-4">
          <CardHeader
            title={hostel.name}
            description={
              hostel.warden
                ? `${hostel.type.toLowerCase()} block · warden ${hostel.warden.firstName} ${hostel.warden.lastName ?? ""}${hostel.contactPhone ? ` · ${hostel.contactPhone}` : ""}`
                : `${hostel.type.toLowerCase()} block · no warden assigned`
            }
            action={
              <Badge tone={OCCUPANCY_TONE[occupancy.state]}>
                {occupancy.occupied}/{occupancy.capacity} beds
              </Badge>
            }
          />

          <div className="px-5 pt-4">
            <ProgressBar
              value={Math.min(100, occupancy.percent)}
              tone={OCCUPANCY_TONE[occupancy.state]}
            />
            <p className="mt-1.5 text-xs text-muted">
              {occupancy.percent}% occupied · {occupancy.bedsFree} beds free
            </p>
          </div>

          {/* Room grid — a warden reads occupancy at a glance, not as a table. */}
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {hostel.rooms.map((room) => {
              const roomOccupancy = occupancyOf(room.allocations.length, room.capacity);
              return (
                <div
                  key={room.id}
                  className={cn(
                    "min-w-24 rounded-[var(--radius-base)] border px-3 py-2",
                    roomOccupancy.state === "OVER_CAPACITY"
                      ? "border-danger bg-danger-soft"
                      : roomOccupancy.state === "FULL"
                        ? "border-transparent bg-warning-soft"
                        : roomOccupancy.state === "EMPTY"
                          ? "border-dashed border-border bg-transparent"
                          : "border-transparent bg-success-soft",
                  )}
                  title={room.allocations
                    .map(
                      (allocation) =>
                        `${allocation.student.firstName} ${allocation.student.lastName ?? ""}`,
                    )
                    .join(", ")}
                >
                  <p className="text-xs font-semibold">{room.roomNumber}</p>
                  <p className="numeric text-[11px] text-muted">
                    {roomOccupancy.occupied}/{room.capacity} beds
                  </p>
                  {room.monthlyFee ? (
                    <p className="text-[10px] text-muted">
                      {formatMoney(room.monthlyFee, currency)}/mo
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {occupancy.occupied === 0 ? (
            <EmptyState title="No residents in this block" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Resident</Th>
                  <Th>Class</Th>
                  <Th>Room</Th>
                  <Th>Bed</Th>
                  <Th>Allocated</Th>
                </tr>
              </thead>
              <tbody>
                {hostel.rooms.flatMap((room) =>
                  room.allocations.map((allocation) => {
                    const enrollment = allocation.student.enrollments[0];
                    const eligible = canAllocate(
                      { gender: allocation.student.gender as Gender | null },
                      { type: hostel.type as HostelType },
                    );
                    return (
                      <tr key={allocation.id} className="hover:bg-surface-hover">
                        <Td>
                          <Link
                            href={`/students/${allocation.student.id}`}
                            className="flex items-center gap-2.5"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand">
                              {initials(
                                allocation.student.firstName,
                                allocation.student.lastName,
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium hover:text-brand">
                                {allocation.student.firstName}{" "}
                                {allocation.student.lastName}
                              </span>
                              <span className="block font-mono text-[11px] text-muted">
                                {allocation.student.admissionNo}
                              </span>
                            </span>
                          </Link>
                        </Td>
                        <Td className="text-muted-strong">
                          {enrollment
                            ? `${enrollment.section.classLevel.name} ${enrollment.section.name}`
                            : "—"}
                        </Td>
                        <Td className="font-medium">{room.roomNumber}</Td>
                        <Td className="numeric text-muted-strong">
                          {allocation.bedNumber ?? "—"}
                        </Td>
                        <Td className="text-muted-strong">
                          {formatDate(allocation.allocatedOn)}
                          {!eligible.allowed ? (
                            <Badge tone="danger" className="ml-2">
                              wrong block
                            </Badge>
                          ) : null}
                        </Td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </Table>
          )}
        </Card>
      ))}

      <p className="mt-3 text-xs text-muted">
        A gendered block only accepts matching residents. A student with no
        gender on record, or recorded as other, needs an explicit placement
        decision rather than an automatic one.
      </p>
      {canManage ? (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <AddBlock
              wardens={possibleWardens.map((warden) => ({
                value: warden.id,
                label: `${warden.firstName} ${warden.lastName}`,
              }))}
            />
            <AddRoom
              blocks={panelBlocks.map((block) => ({
                value: block.id,
                label: `${block.name} (${block.type.toLowerCase()})`,
              }))}
            />
          </div>

          <div className="mt-4">
            <AllocateRoom
              rooms={roomsWithSpace.map((room) => ({
                value: room.id,
                label: `${room.hostel.name} · ${room.roomNumber} — ${room.capacity - room._count.allocations} free`,
              }))}
              students={unhousedStudents.map((student) => ({
                value: student.id,
                label: `${student.firstName} ${student.lastName} (${student.admissionNo}${
                  student.gender ? `, ${student.gender.toLowerCase()}` : ", gender not recorded"
                })`,
              }))}
            />
          </div>
        </>
      ) : null}

    </>
  );
}
