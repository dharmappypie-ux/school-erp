/**
 * Checks broadcast audience resolution and message sizing.
 *
 *   npx tsx scripts/verify-broadcast.ts
 *
 * A broadcast reaches hundreds of families at once, so the two failure modes
 * worth guarding are messaging someone three times because they have three
 * children, and reporting a send as complete when a chunk of the audience had
 * no contact details.
 */

import {
  measureMessage,
  missingVariables,
  resolveAudience,
  destinationFor,
  type Candidate,
} from "../src/lib/broadcast";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: "g1",
    name: "Rakesh Verma",
    email: "rakesh@example.com",
    phone: "+919812345678",
    userId: "u1",
    ...over,
  };
}

console.log("\n— destination per channel —");
{
  const person = candidate();
  check("email uses the email address", "destination" in destinationFor("EMAIL", person));
  check("SMS uses the phone number", "destination" in destinationFor("SMS", person));
  check("WhatsApp uses the phone number", "destination" in destinationFor("WHATSAPP", person));
  check("in-app uses the portal account", "destination" in destinationFor("IN_APP", person));

  const noPhone = destinationFor("SMS", candidate({ phone: null }));
  check("SMS without a phone number is unreachable", "reason" in noPhone, "reason" in noPhone ? noPhone.reason : "");

  const noAccount = destinationFor("PUSH", candidate({ userId: null }));
  check("push without a portal account is unreachable", "reason" in noAccount);
}

console.log("\n— duplicate collapsing —");
{
  // The same guardian appearing once per child.
  const siblings: Candidate[] = [
    candidate({ id: "g1" }),
    candidate({ id: "g1" }),
    candidate({ id: "g1" }),
  ];
  const result = resolveAudience(siblings, "SMS");
  check(
    "a guardian with three children is messaged once",
    result.recipients.length === 1,
    `${result.recipients.length} recipient, ${result.duplicatesCollapsed} collapsed`,
  );
  check("the collapsed count is reported", result.duplicatesCollapsed === 2);
}

{
  // Two different guardians sharing one household phone.
  const household: Candidate[] = [
    candidate({ id: "g1", name: "Rakesh", phone: "+919812345678" }),
    candidate({ id: "g2", name: "Sunita", phone: "+919812345678" }),
  ];
  const result = resolveAudience(household, "SMS");
  check(
    "two guardians on one phone number receive one message",
    result.recipients.length === 1,
    "the handset would otherwise buzz twice",
  );

  // The same two people are separately reachable by email.
  const byEmail = resolveAudience(
    [
      candidate({ id: "g1", email: "rakesh@example.com" }),
      candidate({ id: "g2", email: "sunita@example.com" }),
    ],
    "EMAIL",
  );
  check(
    "distinct email addresses are not collapsed",
    byEmail.recipients.length === 2,
  );
}

{
  const mixedCase = resolveAudience(
    [
      candidate({ id: "g1", email: "Parent@Example.com" }),
      candidate({ id: "g2", email: "parent@example.com" }),
    ],
    "EMAIL",
  );
  check(
    "addresses differing only by case collapse",
    mixedCase.recipients.length === 1,
  );
}

console.log("\n— unreachable recipients —");
{
  const mixed: Candidate[] = [
    candidate({ id: "a", phone: "+911111111111" }),
    candidate({ id: "b", phone: null }),
    candidate({ id: "c", phone: null }),
  ];
  const result = resolveAudience(mixed, "SMS");
  check("reachable recipients are returned", result.recipients.length === 1);
  check(
    "unreachable candidates are reported, not silently dropped",
    result.unreachable.length === 2,
    '"sent to 400" when 60 had no number is a lie the office would act on',
  );
  check(
    "each unreachable entry carries a reason",
    result.unreachable.every((entry) => entry.reason.length > 0),
  );
  check(
    "reachable plus unreachable accounts for everyone",
    result.recipients.length + result.unreachable.length === mixed.length,
  );
}

{
  const empty = resolveAudience([], "EMAIL");
  check("an empty audience resolves to nothing", empty.recipients.length === 0);
}

console.log("\n— SMS sizing —");
{
  const short = measureMessage("Parent teacher meeting on Saturday at 9am.", "SMS");
  check("a short Latin message is one segment", short.segments === 1 && short.encoding === "GSM7");

  const exactly160 = measureMessage("a".repeat(160), "SMS");
  check("exactly 160 characters is still one segment", exactly160.segments === 1);

  const just161 = measureMessage("a".repeat(161), "SMS");
  check(
    "161 characters becomes two segments",
    just161.segments === 2,
    "concatenated SMS drops to 153 per part",
  );

  const long = measureMessage("a".repeat(306), "SMS");
  check("306 characters fits exactly two segments", long.segments === 2);

  const threeParts = measureMessage("a".repeat(307), "SMS");
  check("307 characters needs three segments", threeParts.segments === 3);
}

console.log("\n— Unicode sizing —");
{
  const hindi = measureMessage("कल विद्यालय बंद रहेगा", "SMS");
  check(
    "a Devanagari message is Unicode",
    hindi.encoding === "UNICODE",
    `${hindi.characters} chars, ${hindi.segments} segment(s)`,
  );

  const withEmoji = measureMessage("School closed tomorrow 🎉", "SMS");
  check(
    "a single emoji forces the whole message to Unicode",
    withEmoji.encoding === "UNICODE",
    "capacity drops from 160 to 70, so cost can triple unexpectedly",
  );

  const unicode71 = measureMessage("न".repeat(71), "SMS");
  check("71 Unicode characters needs two segments", unicode71.segments === 2);

  const unicode70 = measureMessage("न".repeat(70), "SMS");
  check("70 Unicode characters is one segment", unicode70.segments === 1);

  const gsmExtended = measureMessage("Cost: 100€", "SMS");
  check(
    "GSM extended characters stay GSM7 but count double",
    gsmExtended.encoding === "GSM7" && gsmExtended.characters === 11,
    "the euro sign takes an escape byte",
  );
}

console.log("\n— non-SMS channels —");
{
  const email = measureMessage("a".repeat(5000), "EMAIL");
  check("email is never segmented", email.segments === 1);

  const whatsapp = measureMessage("a".repeat(2000), "WHATSAPP");
  check("WhatsApp is never segmented", whatsapp.segments === 1);
}

console.log("\n— template variables —");
{
  const body = "Dear {{guardianName}}, {{studentName}} was absent on {{date}}.";
  const missing = missingVariables(body, { studentName: "Ishaan" });
  check(
    "placeholders without a value are reported",
    missing.length === 2 && missing.includes("guardianName") && missing.includes("date"),
    missing.join(", "),
  );

  const complete = missingVariables(body, {
    guardianName: "Rakesh",
    studentName: "Ishaan",
    date: "16 Aug",
  });
  check("a fully supplied template reports nothing missing", complete.length === 0);

  const repeated = missingVariables("{{name}} and {{name}}", {});
  check("a repeated placeholder is reported once", repeated.length === 1);

  const none = missingVariables("No placeholders here.", {});
  check("plain text has no placeholders", none.length === 0);
}

console.log(
  failures === 0
    ? "\nAll broadcast checks passed.\n"
    : `\n${failures} broadcast check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
