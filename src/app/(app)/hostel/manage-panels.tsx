"use client";

import { addRoom, allocateRoom, saveBlock } from "@/app/(app)/hostel/actions";
import { ManageForm } from "@/components/manage-form";

const BLOCK_TYPES = [
  { value: "BOYS", label: "Boys" },
  { value: "GIRLS", label: "Girls" },
  { value: "MIXED", label: "Mixed" },
];

const ROOM_TYPES = [
  { value: "SINGLE", label: "Single" },
  { value: "DOUBLE", label: "Double" },
  { value: "TRIPLE", label: "Triple" },
  { value: "DORMITORY", label: "Dormitory" },
];

export function AddBlock({ wardens }: { wardens: { value: string; label: string }[] }) {
  return (
    <ManageForm
      title="Add a block"
      description="Gendered blocks are enforced when placing students"
      action={saveBlock}
      submitLabel="Create block"
      fields={[
        { name: "name", label: "Block name", required: true, placeholder: "Nalanda Boys Hostel" },
        { name: "type", label: "Type", type: "select", required: true, options: BLOCK_TYPES, defaultValue: "BOYS", half: true },
        { name: "wardenId", label: "Warden", type: "select", options: wardens, half: true },
        { name: "contactPhone", label: "Contact phone", half: true },
        { name: "address", label: "Address", half: true },
      ]}
    />
  );
}

export function AddRoom({ blocks }: { blocks: { value: string; label: string }[] }) {
  return (
    <ManageForm
      title="Add a room"
      description="Room numbers are unique within a block"
      action={addRoom}
      submitLabel="Add room"
      fields={[
        { name: "hostelId", label: "Block", type: "select", required: true, options: blocks },
        { name: "roomNumber", label: "Room number", required: true, placeholder: "204", half: true },
        { name: "floor", label: "Floor", placeholder: "2", half: true },
        { name: "capacity", label: "Beds", type: "number", min: "1", required: true, defaultValue: "2", half: true },
        { name: "roomType", label: "Room type", type: "select", required: true, options: ROOM_TYPES, defaultValue: "DOUBLE", half: true },
        { name: "monthlyFee", label: "Monthly fee", type: "number", min: "0", step: "0.01", half: true },
      ]}
    />
  );
}

export function AllocateRoom({
  rooms,
  students,
}: {
  rooms: { value: string; label: string }[];
  students: { value: string; label: string }[];
}) {
  return (
    <ManageForm
      title="Place a student"
      description="Checked against the block's gender and its free beds"
      action={allocateRoom}
      submitLabel="Allocate bed"
      footnote="A student with no gender recorded is refused rather than defaulted — that decision needs a person."
      fields={[
        { name: "studentId", label: "Student", type: "select", required: true, options: students },
        {
          name: "roomId",
          label: "Room with a free bed",
          type: "select",
          required: true,
          options: rooms,
          hint: rooms.length === 0 ? "Every room is full." : undefined,
        },
        { name: "bedNumber", label: "Bed", placeholder: "B", half: true },
      ]}
    />
  );
}
