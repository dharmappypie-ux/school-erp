/**
 * Hostel occupancy and allocation rules.
 *
 * The eligibility check here is a safeguarding control, not a formatting
 * concern: placing a child in the wrong block is the kind of mistake a
 * boarding school cannot make, so it is enforced in code rather than left to
 * whoever is filling in the form.
 */

export type HostelType = "BOYS" | "GIRLS" | "MIXED";
export type Gender = "MALE" | "FEMALE" | "OTHER";

export type OccupancyState = "EMPTY" | "AVAILABLE" | "FULL" | "OVER_CAPACITY";

export interface Occupancy {
  occupied: number;
  capacity: number;
  bedsFree: number;
  percent: number;
  state: OccupancyState;
}

/**
 * Bed usage for a room or a whole block.
 *
 * Over-capacity is surfaced rather than clamped — more residents than beds is
 * a fact the warden needs to see, not a number to tidy away.
 */
export function occupancyOf(occupied: number, capacity: number): Occupancy {
  const safeCapacity = Math.max(0, capacity);
  const percent = safeCapacity > 0 ? (occupied / safeCapacity) * 100 : 0;

  let state: OccupancyState;
  if (safeCapacity > 0 && occupied > safeCapacity) state = "OVER_CAPACITY";
  else if (occupied === 0) state = "EMPTY";
  else if (occupied >= safeCapacity) state = "FULL";
  else state = "AVAILABLE";

  return {
    occupied,
    capacity: safeCapacity,
    bedsFree: Math.max(0, safeCapacity - occupied),
    percent: Math.round(percent * 10) / 10,
    state,
  };
}

export interface EligibilityResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Whether a student may be placed in a block.
 *
 * A `MIXED` block accepts anyone. A gendered block accepts only the matching
 * gender; a student recorded as `OTHER` — or with no gender on file — is
 * refused a gendered block rather than guessed at, and the office is told to
 * place them explicitly.
 */
export function canAllocate(
  student: { gender?: Gender | null },
  hostel: { type: HostelType },
): EligibilityResult {
  if (hostel.type === "MIXED") return { allowed: true };

  if (!student.gender) {
    return {
      allowed: false,
      reason: "No gender recorded for this student, so a gendered block cannot be assigned automatically.",
    };
  }

  if (hostel.type === "BOYS" && student.gender === "MALE") return { allowed: true };
  if (hostel.type === "GIRLS" && student.gender === "FEMALE") return { allowed: true };

  if (student.gender === "OTHER") {
    return {
      allowed: false,
      reason: "This student needs an explicit placement decision rather than a gendered block.",
    };
  }

  return {
    allowed: false,
    reason: `A ${student.gender.toLowerCase()} student cannot be placed in the ${hostel.type.toLowerCase()} block.`,
  };
}

export interface RoomCandidate {
  id: string;
  roomNumber: string;
  capacity: number;
  occupied: number;
  isActive: boolean;
}

/**
 * Rooms with a free bed, fullest first.
 *
 * Filling partly-occupied rooms before opening empty ones keeps wings
 * consolidated, which is how wardens actually allocate — it avoids one
 * resident alone on an otherwise empty floor.
 */
export function placeableRooms(rooms: readonly RoomCandidate[]): RoomCandidate[] {
  return rooms
    .filter((room) => room.isActive && room.occupied < room.capacity)
    .sort((a, b) => {
      const freeA = a.capacity - a.occupied;
      const freeB = b.capacity - b.occupied;
      if (freeA !== freeB) return freeA - freeB;
      return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
    });
}
