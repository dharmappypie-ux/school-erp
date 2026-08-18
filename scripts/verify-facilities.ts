/**
 * Checks the library circulation and hostel allocation rules.
 *
 *   npx tsx scripts/verify-facilities.ts
 *
 * Covers src/lib/library.ts and src/lib/hostel.ts together — both are small,
 * pure rule sets governing the same kind of decision: what a borrower owes,
 * and where a child may sleep.
 */

import {
  availability,
  canRenew,
  computeFine,
  dueDateFor,
  DEFAULT_LOAN_POLICY,
  type CopyState,
} from "../src/lib/library";
import { canAllocate, occupancyOf, placeableRooms } from "../src/lib/hostel";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const NOW = new Date("2026-08-16T09:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86400000);

console.log("\n— library: due dates —");
{
  const due = dueDateFor(new Date("2026-08-01T10:00:00Z"));
  check(
    "the default loan runs 14 days",
    due.toISOString().slice(0, 10) === "2026-08-15",
    due.toISOString().slice(0, 10),
  );
}

console.log("\n— library: fines —");
{
  const notDue = computeFine({ dueOn: days(3) }, DEFAULT_LOAN_POLICY, NOW);
  check("a book not yet due owes nothing", notDue.amount === 0 && notDue.daysOverdue === 0);

  const dueToday = computeFine({ dueOn: days(0) }, DEFAULT_LOAN_POLICY, NOW);
  check(
    "a book due today is not yet overdue",
    dueToday.amount === 0,
    "compared by whole days, not clock time",
  );

  const late = computeFine({ dueOn: days(-5) }, DEFAULT_LOAN_POLICY, NOW);
  check("five days late owes five days of fine", late.amount === 10, `${late.amount}`);

  const capped = computeFine({ dueOn: days(-400) }, DEFAULT_LOAN_POLICY, NOW);
  check(
    "a forgotten book is capped rather than accruing forever",
    capped.amount === DEFAULT_LOAN_POLICY.maxFine && capped.isCapped,
    `${capped.amount} after ${capped.daysOverdue} days`,
  );

  const returned = computeFine(
    { dueOn: days(-10), returnedOn: days(-6) },
    DEFAULT_LOAN_POLICY,
    NOW,
  );
  check(
    "a returned book is charged to its return date, not to today",
    returned.amount === 8,
    `${returned.daysOverdue} days overdue at return, not ${10}`,
  );

  const withGrace = computeFine(
    { dueOn: days(-4) },
    { ...DEFAULT_LOAN_POLICY, graceDays: 3 },
    NOW,
  );
  check(
    "grace days are deducted before charging",
    withGrace.chargeableDays === 1 && withGrace.amount === 2,
    `${withGrace.daysOverdue} overdue, ${withGrace.chargeableDays} chargeable`,
  );

  const insideGrace = computeFine(
    { dueOn: days(-2) },
    { ...DEFAULT_LOAN_POLICY, graceDays: 3 },
    NOW,
  );
  check("inside the grace period there is no fine", insideGrace.amount === 0);
}

console.log("\n— library: availability —");
{
  const states: CopyState[] = [
    "AVAILABLE", "AVAILABLE", "ISSUED", "LOST", "DAMAGED", "WITHDRAWN",
  ];
  const result = availability(states);
  check("available copies are counted", result.available === 2);
  check("issued copies are counted separately", result.onLoan === 1);
  check(
    "lost, damaged and withdrawn copies are out of circulation",
    result.outOfCirculation === 3,
    "they must not look lendable",
  );
  check("a title with a free copy can be issued", result.canIssue);

  const noneFree = availability(["ISSUED", "LOST"]);
  check("a title with no free copy cannot be issued", !noneFree.canIssue);

  const empty = availability([]);
  check("a title with no copies at all cannot be issued", !empty.canIssue && empty.total === 0);
}

console.log("\n— library: renewals —");
{
  check(
    "a current loan within the renewal limit may renew",
    canRenew({ renewCount: 0, dueOn: days(2) }, { asOf: NOW }).allowed,
  );

  const atLimit = canRenew({ renewCount: 2, dueOn: days(2) }, { asOf: NOW });
  check("the renewal limit is enforced", !atLimit.allowed, atLimit.reason);

  const overdue = canRenew({ renewCount: 0, dueOn: days(-1) }, { asOf: NOW });
  check(
    "an overdue book cannot be renewed",
    !overdue.allowed,
    "renewing would silently erase the fine owed",
  );

  const reserved = canRenew(
    { renewCount: 0, dueOn: days(2) },
    { hasReservation: true, asOf: NOW },
  );
  check("a reserved title blocks renewal", !reserved.allowed, reserved.reason);

  const returned = canRenew(
    { renewCount: 0, dueOn: days(2), returnedOn: days(-1) },
    { asOf: NOW },
  );
  check("a returned copy cannot be renewed", !returned.allowed);

  const dueToday = canRenew({ renewCount: 0, dueOn: days(0) }, { asOf: NOW });
  check("a book due today may still be renewed", dueToday.allowed);
}

console.log("\n— hostel: occupancy —");
{
  const empty = occupancyOf(0, 3);
  check("an unused room is empty", empty.state === "EMPTY" && empty.bedsFree === 3);

  const partial = occupancyOf(2, 3);
  check("a partly used room is available", partial.state === "AVAILABLE" && partial.bedsFree === 1);

  const full = occupancyOf(3, 3);
  check("a room at capacity is full, not over", full.state === "FULL" && full.bedsFree === 0);

  const over = occupancyOf(5, 3);
  check("more residents than beds is over capacity", over.state === "OVER_CAPACITY");
  check(
    "over-capacity percentage is shown above 100 rather than clamped",
    over.percent > 100,
    `${over.percent}%`,
  );
  check("beds free never goes negative", over.bedsFree === 0);

  const noBeds = occupancyOf(1, 0);
  check("a room with no recorded capacity does not divide by zero", noBeds.percent === 0);
}

console.log("\n— hostel: allocation eligibility —");
{
  check(
    "a boy may be placed in the boys block",
    canAllocate({ gender: "MALE" }, { type: "BOYS" }).allowed,
  );
  check(
    "a girl may be placed in the girls block",
    canAllocate({ gender: "FEMALE" }, { type: "GIRLS" }).allowed,
  );

  const wrongBlock = canAllocate({ gender: "FEMALE" }, { type: "BOYS" });
  check(
    "a girl cannot be placed in the boys block",
    !wrongBlock.allowed,
    wrongBlock.reason,
  );

  const otherWrong = canAllocate({ gender: "MALE" }, { type: "GIRLS" });
  check("a boy cannot be placed in the girls block", !otherWrong.allowed);

  check(
    "a mixed block accepts any student",
    canAllocate({ gender: "OTHER" }, { type: "MIXED" }).allowed,
  );

  const unknown = canAllocate({ gender: null }, { type: "BOYS" });
  check(
    "a student with no gender on file is refused rather than guessed at",
    !unknown.allowed,
    unknown.reason,
  );

  const other = canAllocate({ gender: "OTHER" }, { type: "GIRLS" });
  check(
    "a student recorded as other needs an explicit decision",
    !other.allowed,
    other.reason,
  );
}

console.log("\n— hostel: room placement —");
{
  const rooms = [
    { id: "a", roomNumber: "101", capacity: 3, occupied: 3, isActive: true },
    { id: "b", roomNumber: "102", capacity: 3, occupied: 2, isActive: true },
    { id: "c", roomNumber: "103", capacity: 3, occupied: 0, isActive: true },
    { id: "d", roomNumber: "104", capacity: 3, occupied: 1, isActive: false },
  ];
  const placeable = placeableRooms(rooms);

  check("full rooms are excluded", !placeable.some((room) => room.id === "a"));
  check("inactive rooms are excluded", !placeable.some((room) => room.id === "d"));
  check(
    "the fullest room with a free bed comes first",
    placeable[0]?.id === "b",
    "consolidates wings instead of scattering residents",
  );
  check("empty rooms come last", placeable[placeable.length - 1]?.id === "c");
}

console.log(
  failures === 0
    ? "\nAll library and hostel checks passed.\n"
    : `\n${failures} facilities check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
