/**
 * Checks the homework and messaging rules.
 *
 *   npx tsx scripts/verify-collaboration.ts
 *
 * Two distinctions carry the weight here: late work is not the same as missing
 * work (a teacher chases those differently), and thread membership is not the
 * same as holding the messages permission.
 */

import {
  daysUntilDue,
  displayStatus,
  progressOf,
  validateAssignment,
  validateGrade,
} from "../src/lib/homework";
import {
  isMember,
  threadTitle,
  unreadCount,
  validateMessage,
} from "../src/lib/messaging";

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const due = new Date("2026-08-10T23:59:00Z");
const before = new Date("2026-08-09T10:00:00Z");
const after = new Date("2026-08-12T10:00:00Z");

console.log("\n— submission status —");
{
  check(
    "nothing submitted before the deadline is still assigned",
    displayStatus({ status: "ASSIGNED", submittedAt: null, marksObtained: null }, due, before) === "ASSIGNED",
  );
  check(
    "nothing submitted after the deadline is missing, not late",
    displayStatus({ status: "ASSIGNED", submittedAt: null, marksObtained: null }, due, after) === "MISSING",
    "a teacher chasing missing work needs it separated from late work",
  );
  check(
    "handed in before the deadline is submitted",
    displayStatus({ status: "SUBMITTED", submittedAt: before, marksObtained: null }, due, after) === "SUBMITTED",
  );
  check(
    "handed in after the deadline is late",
    displayStatus({ status: "SUBMITTED", submittedAt: after, marksObtained: null }, due, after) === "LATE",
  );
  check(
    "a graded submission stays graded even if it was late",
    displayStatus({ status: "GRADED", submittedAt: after, marksObtained: 8 }, due, after) === "GRADED",
  );
  check(
    "a resubmission request survives the deadline passing",
    displayStatus({ status: "RESUBMIT", submittedAt: before, marksObtained: null }, due, after) === "RESUBMIT",
  );
}

console.log("\n— progress —");
{
  const progress = progressOf(
    [
      { status: "GRADED", submittedAt: before, marksObtained: 9 },
      { status: "SUBMITTED", submittedAt: before, marksObtained: null },
      { status: "SUBMITTED", submittedAt: after, marksObtained: null },
      { status: "ASSIGNED", submittedAt: null, marksObtained: null },
    ],
    due,
    after,
  );

  check("submitted counts graded and late work", progress.submitted === 3);
  check("missing is counted separately", progress.missing === 1);
  check("late is counted separately", progress.late === 1);
  check("submission rate is of the class", progress.submissionRate === 75, `${progress.submissionRate}%`);
  check(
    "graded rate is of what came in, not the class",
    progress.gradedRate === 33.3,
    "a teacher who marked everything received is done, absentees notwithstanding",
  );

  const none = progressOf([], due, after);
  check("an empty class does not divide by zero", none.submissionRate === 0 && none.gradedRate === 0);
}

console.log("\n— assignment validation —");
{
  const assignedOn = new Date("2026-08-01T00:00:00Z");
  check("a normal assignment is valid", validateAssignment({ title: "Chapter 4", assignedOn, dueOn: due, maxMarks: 20 }).ok);
  check("a blank title is refused", !validateAssignment({ title: "  ", assignedOn, dueOn: due, maxMarks: null }).ok);
  check(
    "a due date before the set date is refused",
    !validateAssignment({ title: "Chapter 4", assignedOn: after, dueOn: before, maxMarks: null }).ok,
  );
  check("zero max marks is refused", !validateAssignment({ title: "X", assignedOn, dueOn: due, maxMarks: 0 }).ok);
  check("an ungraded assignment is allowed", validateAssignment({ title: "Reading", assignedOn, dueOn: due, maxMarks: null }).ok);
  check("an implausible mark total is refused", !validateAssignment({ title: "X", assignedOn, dueOn: due, maxMarks: 5000 }).ok);
}

console.log("\n— grading —");
{
  check("a mark within range is accepted", validateGrade(8, 10).ok);
  check("full marks are accepted", validateGrade(10, 10).ok);
  check("zero is accepted", validateGrade(0, 10).ok);
  check("a mark above the maximum is refused", !validateGrade(11, 10).ok);
  check("a negative mark is refused", !validateGrade(-1, 10).ok);
  check("a non-number is refused", !validateGrade(Number.NaN, 10).ok);
  check(
    "grading an ungraded assignment is refused",
    !validateGrade(5, null).ok,
    "marks against an assignment with no total are meaningless",
  );
}

console.log("\n— due dates —");
{
  check("due today reads as zero", daysUntilDue(new Date("2026-08-12T08:00:00Z"), after) === 0);
  check("overdue is negative", daysUntilDue(due, after) < 0);
  check("upcoming is positive", daysUntilDue(new Date("2026-08-20T00:00:00Z"), after) === 8);
}

console.log("\n— thread membership —");
{
  const members = [
    { userId: "u1", lastReadAt: new Date("2026-08-10T00:00:00Z") },
    { userId: "u2", lastReadAt: null },
  ];

  check("a member is recognised", isMember(members, "u1"));
  check(
    "a non-member is refused",
    !isMember(members, "u3"),
    "holding messages.use does not grant access to a conversation",
  );
  check("an empty thread admits nobody", !isMember([], "u1"));
}

console.log("\n— unread counts —");
{
  const messages = [
    { senderId: "u2", createdAt: new Date("2026-08-09T00:00:00Z") },
    { senderId: "u2", createdAt: new Date("2026-08-11T00:00:00Z") },
    { senderId: "u1", createdAt: new Date("2026-08-12T00:00:00Z") },
  ];

  const u1 = { userId: "u1", lastReadAt: new Date("2026-08-10T00:00:00Z") };
  check("messages after the read mark count", unreadCount(messages, u1) === 1);
  check(
    "your own messages are never unread to you",
    unreadCount([{ senderId: "u1", createdAt: new Date("2026-08-20T00:00:00Z") }], u1) === 0,
  );

  const neverRead = { userId: "u2", lastReadAt: null };
  check(
    "a participant who never opened the thread sees all others' messages",
    unreadCount(messages, neverRead) === 1,
    "only u1's message is from someone else",
  );
  check("a non-participant has no unread count", unreadCount(messages, undefined) === 0);
}

console.log("\n— thread titles —");
{
  const people = [
    { userId: "me", name: "Asha" },
    { userId: "u2", name: "Bala" },
    { userId: "u3", name: "Chitra" },
  ];

  check("an explicit subject wins", threadTitle("Fee query", people, "me") === "Fee query");
  check("a blank subject falls back to names", threadTitle("   ", people, "me") === "Bala, Chitra");
  check("your own name is excluded", !threadTitle(null, people, "me").includes("Asha"));

  const many = [
    { userId: "me", name: "Asha" },
    ...Array.from({ length: 5 }, (_, i) => ({ userId: `u${i}`, name: `P${i}` })),
  ];
  check(
    "a large thread is summarised",
    threadTitle(null, many, "me") === "P0, P1 and 3 others",
    threadTitle(null, many, "me"),
  );
  check("a thread with only you says so", threadTitle(null, [{ userId: "me", name: "Asha" }], "me") === "Just you");
}

console.log("\n— message validation —");
{
  check("a normal message is accepted", validateMessage("Hello").ok);
  check("an empty message is refused", !validateMessage("").ok);
  check("a whitespace-only message is refused", !validateMessage("   \n  ").ok);
  check("an over-long message is refused", !validateMessage("x".repeat(5001)).ok);
  check("a message at the limit is accepted", validateMessage("x".repeat(5000)).ok);
}

console.log(
  failures === 0
    ? "\nAll homework and messaging checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
