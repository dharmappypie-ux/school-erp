"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

/** An empty date field means "not recorded", which is not the same as invalid. */
const optionalDate = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? new Date(value) : null))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), {
    message: "That date could not be read",
  });

const VehicleSchema = z.object({
  registrationNo: z
    .string()
    .trim()
    .min(4, "Enter the registration number")
    .max(20)
    .transform((value) => value.toUpperCase().replace(/\s+/g, "")),
  model: z.string().trim().max(80).optional(),
  vehicleType: z.enum(["BUS", "VAN", "CAR", "TEMPO"]),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(120),
  driverName: z.string().trim().max(120).optional(),
  driverPhone: z.string().trim().max(20).optional(),
  driverLicense: z.string().trim().max(40).optional(),
  insuranceExpiry: optionalDate,
  fitnessExpiry: optionalDate,
  pollutionExpiry: optionalDate,
  gpsDeviceId: z.string().trim().max(60).optional(),
});

export async function saveVehicle(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = VehicleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("transport.manage");
  const db = scopedDb(session.schoolId);
  const editingId = raw.id?.trim() || null;

  // Registrations are unique per school; catching it here gives a readable
  // message instead of a database constraint error.
  const clash = await db.vehicle.findFirst({
    where: {
      registrationNo: parsed.data.registrationNo,
      ...(editingId ? { NOT: { id: editingId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    return {
      ok: false,
      message: `${parsed.data.registrationNo} is already on the fleet.`,
      values: raw,
    };
  }

  const data = {
    registrationNo: parsed.data.registrationNo,
    model: parsed.data.model || null,
    vehicleType: parsed.data.vehicleType,
    capacity: parsed.data.capacity,
    driverName: parsed.data.driverName || null,
    driverPhone: parsed.data.driverPhone || null,
    driverLicense: parsed.data.driverLicense || null,
    insuranceExpiry: parsed.data.insuranceExpiry,
    fitnessExpiry: parsed.data.fitnessExpiry,
    pollutionExpiry: parsed.data.pollutionExpiry,
    gpsDeviceId: parsed.data.gpsDeviceId || null,
  };

  const vehicle = editingId
    ? await db.vehicle.update({ where: { id: editingId }, data, select: { id: true, registrationNo: true } })
    : await db.vehicle.create({
        data: { ...data, schoolId: session.schoolId },
        select: { id: true, registrationNo: true },
      });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: editingId ? "transport.vehicle.update" : "transport.vehicle.create",
    entityType: "Vehicle",
    entityId: vehicle.id,
    after: data,
  });

  revalidatePath("/transport");
  return {
    ok: true,
    message: `${vehicle.registrationNo} ${editingId ? "updated" : "added to the fleet"}.`,
  };
}

const RouteSchema = z.object({
  name: z.string().trim().min(2, "Name the route").max(120),
  code: z.string().trim().max(20).optional(),
  vehicleId: z.string().trim().optional(),
  startPoint: z.string().trim().max(160).optional(),
  endPoint: z.string().trim().max(160).optional(),
  distanceKm: z.string().optional(),
});

export async function saveRoute(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = RouteSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("transport.manage");
  const db = scopedDb(session.schoolId);
  const editingId = raw.id?.trim() || null;

  const distance = parsed.data.distanceKm?.trim() ? Number(parsed.data.distanceKm) : null;
  if (distance !== null && (!Number.isFinite(distance) || distance <= 0)) {
    return { ok: false, message: "Distance must be a positive number.", values: raw };
  }

  // A vehicle from another school must not be attachable to this route.
  if (parsed.data.vehicleId) {
    const vehicle = await db.vehicle.findUnique({
      where: { id: parsed.data.vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      return { ok: false, message: "That vehicle is not on your fleet.", values: raw };
    }
  }

  const data = {
    name: parsed.data.name,
    code: parsed.data.code || null,
    vehicleId: parsed.data.vehicleId || null,
    startPoint: parsed.data.startPoint || null,
    endPoint: parsed.data.endPoint || null,
    distanceKm: distance,
  };

  const route = editingId
    ? await db.route.update({ where: { id: editingId }, data, select: { id: true, name: true } })
    : await db.route.create({
        data: { ...data, schoolId: session.schoolId },
        select: { id: true, name: true },
      });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: editingId ? "transport.route.update" : "transport.route.create",
    entityType: "Route",
    entityId: route.id,
    after: data,
  });

  revalidatePath("/transport");
  revalidatePath(`/transport/routes/${route.id}`);
  return { ok: true, message: `Route “${route.name}” ${editingId ? "updated" : "created"}.` };
}

const StopSchema = z.object({
  routeId: z.string().min(1),
  name: z.string().trim().min(2, "Name the stop").max(120),
  pickupTime: z.string().trim().max(10).optional(),
  dropTime: z.string().trim().max(10).optional(),
  monthlyFare: z.string().optional(),
});

export async function addStop(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = StopSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("transport.manage");
  const db = scopedDb(session.schoolId);

  const route = await db.route.findUnique({
    where: { id: parsed.data.routeId },
    select: { id: true },
  });
  if (!route) return { ok: false, message: "Route not found in your school.", values: raw };

  const fare = parsed.data.monthlyFare?.trim() ? Number(parsed.data.monthlyFare) : null;
  if (fare !== null && (!Number.isFinite(fare) || fare < 0)) {
    return { ok: false, message: "Fare must be zero or more.", values: raw };
  }

  // tenant-safe: route_stops has no schoolId; the parent route was resolved
  // through scopedDb immediately above.
  const last = await db.routeStop.findFirst({
    where: { routeId: route.id },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  // tenant-safe: routeId is the route resolved through scopedDb above.
  await db.routeStop.create({
    data: {
      routeId: route.id,
      name: parsed.data.name,
      sequence: (last?.sequence ?? 0) + 1,
      pickupTime: parsed.data.pickupTime || null,
      dropTime: parsed.data.dropTime || null,
      monthlyFare: fare,
    },
  });

  revalidatePath(`/transport/routes/${route.id}`);
  return { ok: true, message: `Stop “${parsed.data.name}” added.` };
}

export async function removeStop(stopId: string): Promise<ActionResult> {
  const session = await requirePermission("transport.manage");
  const db = scopedDb(session.schoolId);

  // tenant-safe: reaches the tenant through the parent route's schoolId.
  const stop = await db.routeStop.findFirst({
    where: { id: stopId, route: { schoolId: session.schoolId } },
    select: { id: true, routeId: true, _count: { select: { assignments: true } } },
  });
  if (!stop) return { ok: false, message: "Stop not found in your school." };

  if (stop._count.assignments > 0) {
    // Deleting would cascade the students riding from here into nothing.
    return {
      ok: false,
      message: `${stop._count.assignments} students are assigned to this stop. Move them first.`,
    };
  }

  // tenant-safe: `stop` was resolved by a findFirst requiring
  // route.schoolId to match this session.
  await db.routeStop.delete({ where: { id: stop.id } });
  revalidatePath(`/transport/routes/${stop.routeId}`);
  return { ok: true, message: "Stop removed." };
}
