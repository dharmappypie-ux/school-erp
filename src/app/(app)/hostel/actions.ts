"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { canAllocate } from "@/lib/hostel";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const BlockSchema = z.object({
  name: z.string().trim().min(2, "Name the block").max(120),
  type: z.enum(["BOYS", "GIRLS", "MIXED"]),
  address: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  wardenId: z.string().trim().optional(),
});

export async function saveBlock(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = BlockSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("hostel.manage");
  const db = scopedDb(session.schoolId);
  const editingId = raw.id?.trim() || null;

  if (parsed.data.wardenId) {
    const warden = await db.staffMember.findUnique({
      where: { id: parsed.data.wardenId },
      select: { id: true },
    });
    if (!warden) return { ok: false, message: "That warden is not on your staff.", values: raw };
  }

  const data = {
    name: parsed.data.name,
    type: parsed.data.type,
    address: parsed.data.address || null,
    contactPhone: parsed.data.contactPhone || null,
    wardenId: parsed.data.wardenId || null,
  };

  const block = editingId
    ? await db.hostel.update({ where: { id: editingId }, data, select: { id: true, name: true } })
    : await db.hostel.create({
        data: { ...data, schoolId: session.schoolId },
        select: { id: true, name: true },
      });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: editingId ? "hostel.block.update" : "hostel.block.create",
    entityType: "Hostel",
    entityId: block.id,
    after: data,
  });

  revalidatePath("/hostel");
  return { ok: true, message: `${block.name} ${editingId ? "updated" : "created"}.` };
}

const RoomSchema = z.object({
  hostelId: z.string().min(1, "Choose a block"),
  roomNumber: z.string().trim().min(1, "Enter the room number").max(20),
  floor: z.string().trim().max(20).optional(),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(20),
  roomType: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORMITORY"]),
  monthlyFee: z.string().optional(),
});

export async function addRoom(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = RoomSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("hostel.manage");
  const db = scopedDb(session.schoolId);

  const block = await db.hostel.findUnique({
    where: { id: parsed.data.hostelId },
    select: { id: true, name: true },
  });
  if (!block) return { ok: false, message: "Block not found in your school.", values: raw };

  const fee = parsed.data.monthlyFee?.trim() ? Number(parsed.data.monthlyFee) : null;
  if (fee !== null && (!Number.isFinite(fee) || fee < 0)) {
    return { ok: false, message: "Fee must be zero or more.", values: raw };
  }

  // tenant-safe: hostel_rooms has no schoolId; the parent block was resolved
  // through scopedDb above.
  const clash = await db.hostelRoom.findFirst({
    where: { hostelId: block.id, roomNumber: parsed.data.roomNumber },
    select: { id: true },
  });
  if (clash) {
    return {
      ok: false,
      message: `Room ${parsed.data.roomNumber} already exists in ${block.name}.`,
      values: raw,
    };
  }

  // tenant-safe: hostelId is the block resolved through scopedDb above.
  await db.hostelRoom.create({
    data: {
      hostelId: block.id,
      roomNumber: parsed.data.roomNumber,
      floor: parsed.data.floor || null,
      capacity: parsed.data.capacity,
      roomType: parsed.data.roomType,
      monthlyFee: fee,
    },
  });

  revalidatePath("/hostel");
  return { ok: true, message: `Room ${parsed.data.roomNumber} added to ${block.name}.` };
}

const AllocateSchema = z.object({
  roomId: z.string().min(1, "Choose a room"),
  studentId: z.string().min(1, "Choose a student"),
  bedNumber: z.string().trim().max(10).optional(),
});

/**
 * Places a student in a room.
 *
 * The safeguarding rules live in `canAllocate` and are applied here rather than
 * trusted to the form: a gendered block must not take a mismatched student, and
 * a student whose gender is not recorded needs a person to decide, not a
 * default.
 */
export async function allocateRoom(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = AllocateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("hostel.manage");
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;
  if (!yearId) {
    return { ok: false, message: "No academic year is marked current.", values: raw };
  }

  // tenant-safe: the room is reached through its block's schoolId.
  const room = await db.hostelRoom.findFirst({
    where: { id: parsed.data.roomId, hostel: { schoolId: session.schoolId } },
    select: {
      id: true,
      roomNumber: true,
      capacity: true,
      hostel: { select: { id: true, name: true, type: true } },
      allocations: { where: { isActive: true }, select: { id: true } },
    },
  });
  if (!room) return { ok: false, message: "Room not found in your school.", values: raw };

  const student = await db.student.findUnique({
    where: { id: parsed.data.studentId },
    select: { id: true, firstName: true, lastName: true, gender: true },
  });
  if (!student) return { ok: false, message: "Student not found in your school.", values: raw };

  const existing = await db.hostelAllocation.findFirst({
    where: { studentId: student.id, isActive: true },
    select: { id: true, room: { select: { roomNumber: true } } },
  });
  if (existing) {
    return {
      ok: false,
      message: `${student.firstName} already has room ${existing.room.roomNumber}. Vacate that first.`,
      values: raw,
    };
  }

  // Safeguarding first: canAllocate covers the gender rules only.
  const eligibility = canAllocate(
    { gender: student.gender },
    { type: room.hostel.type },
  );
  if (!eligibility.allowed) {
    return { ok: false, message: eligibility.reason ?? "That placement is not allowed.", values: raw };
  }

  // Capacity is a separate concern and is checked here so a room cannot be
  // overfilled by two people allocating at once.
  if (room.allocations.length >= room.capacity) {
    return {
      ok: false,
      message: `Room ${room.roomNumber} is full (${room.allocations.length}/${room.capacity}).`,
      values: raw,
    };
  }

  await db.hostelAllocation.create({
    data: {
      schoolId: session.schoolId,
      studentId: student.id,
      academicYearId: yearId,
      roomId: room.id,
      bedNumber: parsed.data.bedNumber || null,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "hostel.allocate",
    entityType: "HostelAllocation",
    entityId: room.id,
    after: { student: student.id, room: room.roomNumber, block: room.hostel.name },
  });

  revalidatePath("/hostel");
  return {
    ok: true,
    message: `${student.firstName} ${student.lastName} placed in ${room.hostel.name} room ${room.roomNumber}.`,
  };
}

export async function vacateAllocation(allocationId: string): Promise<ActionResult> {
  const session = await requirePermission("hostel.manage");
  const db = scopedDb(session.schoolId);

  const allocation = await db.hostelAllocation.findUnique({
    where: { id: allocationId },
    select: { id: true, isActive: true, student: { select: { firstName: true } } },
  });
  if (!allocation) return { ok: false, message: "Allocation not found in your school." };
  if (!allocation.isActive) return { ok: false, message: "That bed is already vacated." };

  await db.hostelAllocation.update({
    where: { id: allocation.id },
    data: { isActive: false, vacatedOn: new Date() },
  });

  revalidatePath("/hostel");
  return { ok: true, message: `${allocation.student.firstName}'s bed vacated.` };
}
