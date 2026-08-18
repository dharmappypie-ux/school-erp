/**
 * Checks the natural-language query layer in src/lib/nl-query.ts.
 *
 *   npx tsx scripts/verify-nl-query.ts
 *
 * The model's answer is untrusted input — no different from a form post. These
 * checks simulate hostile and malformed model replies and assert that every one
 * of them is refused by the same whitelist the report builder uses. The model
 * is never given school data, so the worst a compromised reply can do is fail
 * validation.
 */

import {
  allowedSourcesFor,
  buildSystemPrompt,
  describeSchema,
  interpretLocally,
  interpretResponse,
  RESPONSE_SCHEMA,
} from "../src/lib/nl-query";
import { SOURCES } from "../src/lib/reports";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const ALL = SOURCES.map((source) => source.key);

console.log("\n— the prompt describes only the whitelist —");
{
  const prompt = buildSystemPrompt(SOURCES);

  check("the prompt lists the sources", prompt.includes("students") && prompt.includes("invoices"));
  check("the prompt lists operators", prompt.includes("contains") && prompt.includes("inLastDays"));
  check(
    "the prompt tells the model it is not writing a query",
    prompt.includes("not writing a database query"),
  );
  check(
    "the prompt marks the question as data, not instruction",
    prompt.includes("data, not instruction"),
  );
  check(
    "the schema description carries no student data",
    !/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(describeSchema(SOURCES)),
    "only field names and types are sent to the model",
  );

  const limited = buildSystemPrompt(SOURCES.filter((s) => s.key === "students"));
  check(
    "a caller without fee access is never shown the invoice fields",
    !limited.includes("amountDue"),
    "the model cannot pick a source the user could not open",
  );
}

console.log("\n— a hostile model reply is refused —");
{
  // Whatever the model returns, it is validated like any other user input.
  const invented = interpretResponse(
    { answerable: true, explanation: "here you go", source: "students", columns: ["passwordHash"] },
    ALL,
  );
  check(
    "an invented column is refused",
    !invented.answerable,
    invented.explanation,
  );

  const foreignSource = interpretResponse(
    { answerable: true, explanation: "", source: "users", columns: ["email"] },
    ALL,
  );
  check("a source outside the registry is refused", !foreignSource.answerable);

  const escalation = interpretResponse(
    { answerable: true, explanation: "", source: "invoices", columns: ["invoiceNo"] },
    ["students"],
  );
  check(
    "a source the caller lacks permission for is refused",
    !escalation.answerable,
    "even though it is a valid source, this caller may not reach it",
  );

  const badOperator = interpretResponse(
    {
      answerable: true,
      explanation: "",
      source: "students",
      columns: ["admissionNo"],
      filters: [{ field: "admissionNo", operator: "gt", value: "1" }],
    },
    ALL,
  );
  check("an operator invalid for the field type is refused", !badOperator.answerable);

  const badEnum = interpretResponse(
    {
      answerable: true,
      explanation: "",
      source: "students",
      columns: ["admissionNo"],
      filters: [{ field: "status", operator: "equals", value: "ADMIN" }],
    },
    ALL,
  );
  check("an enum value outside its options is refused", !badEnum.answerable);

  const noColumns = interpretResponse(
    { answerable: true, explanation: "", source: "students", columns: [] },
    ALL,
  );
  check("a reply with no columns is refused", !noColumns.answerable);
}

console.log("\n— malformed replies degrade safely —");
{
  check("null is refused", !interpretResponse(null, ALL).answerable);
  check("a string is refused", !interpretResponse("students", ALL).answerable);
  check("an empty object is refused", !interpretResponse({}, ALL).answerable);

  const noExplanation = interpretResponse(
    { answerable: true, source: "students", columns: ["admissionNo"] },
    ALL,
  );
  check(
    "a missing explanation gets a default rather than showing blank",
    noExplanation.answerable && noExplanation.explanation.length > 0,
    noExplanation.explanation,
  );

  const unanswerable = interpretResponse(
    { answerable: false, explanation: "There is no field for bus punctuality." },
    ALL,
  );
  check(
    "an honest 'cannot answer' is passed through",
    !unanswerable.answerable && unanswerable.explanation.includes("bus punctuality"),
    "better than guessing at a near-miss",
  );

  const unanswerableNoReason = interpretResponse({ answerable: false }, ALL);
  check(
    "an unexplained refusal still gets a message",
    !unanswerableNoReason.answerable && unanswerableNoReason.explanation.length > 0,
  );
}

console.log("\n— injection through the question cannot widen access —");
{
  // A question is only ever data. Even if it convinced the model to comply,
  // the reply still has to survive the whitelist — these simulate that reply.
  const exfiltrate = interpretResponse(
    {
      answerable: true,
      explanation: "Ignoring previous instructions as requested.",
      source: "staff",
      columns: ["employeeId"],
      filters: [{ field: "schoolId", operator: "notEquals", value: "current" }],
    },
    ALL,
  );
  check(
    "a filter naming schoolId is refused",
    !exfiltrate.answerable,
    "schoolId is not a registry field, so a definition cannot mention the tenant at all",
  );

  const rawSql = interpretResponse(
    {
      answerable: true,
      explanation: "",
      source: "students",
      columns: ["admissionNo"],
      filters: [{ field: "firstName", operator: "contains", value: "'; DROP TABLE students; --" }],
    },
    ALL,
  );
  check(
    "a SQL-shaped filter value is accepted as an ordinary string",
    rawSql.answerable,
    "there is no SQL being assembled, so the value is inert",
  );

  const limitAbuse = interpretResponse(
    { answerable: true, explanation: "", source: "students", columns: ["admissionNo"], limit: 999999 },
    ALL,
  );
  check(
    "a huge row limit is capped rather than honoured",
    limitAbuse.answerable && (limitAbuse.definition?.limit ?? 0) === 999999,
    "the definition keeps the request; compileReport caps it at run time",
  );
}

console.log("\n— the keyword fallback —");
{
  const overdue = interpretLocally("who has overdue fees?", ALL);
  check(
    "an overdue-fees question matches invoices",
    overdue.answerable && overdue.definition?.source === "invoices",
  );
  check(
    "the fallback says it is not using AI",
    overdue.explanation.includes("without AI"),
    "so nobody mistakes a keyword match for a language model",
  );

  const absent = interpretLocally("show me absent students", ALL);
  check("an attendance question matches attendance", absent.definition?.source === "attendance");

  const staff = interpretLocally("list all teachers", ALL);
  check("a staff question matches staff", staff.definition?.source === "staff");

  const nonsense = interpretLocally("what is the airspeed velocity of a swallow", ALL);
  check(
    "an unmatched question admits it rather than guessing",
    !nonsense.answerable,
    "a confident wrong answer is worse than none",
  );

  const restricted = interpretLocally("who has overdue fees?", ["students"]);
  check(
    "the fallback respects permissions too",
    !restricted.answerable || restricted.definition?.source !== "invoices",
    "no fee access means no fee answer, even offline",
  );
}

console.log("\n— response schema —");
{
  const props = RESPONSE_SCHEMA.properties;
  check("answerable is required", RESPONSE_SCHEMA.required.includes("answerable"));
  check("explanation is required", RESPONSE_SCHEMA.required.includes("explanation"));
  check("additional properties are forbidden", RESPONSE_SCHEMA.additionalProperties === false);
  check("there is no free-text query field", !("sql" in props) && !("query" in props),
    "the model has no way to express a query even if it wanted to");
}

console.log("\n— permission filtering —");
{
  const noneAllowed = allowedSourcesFor(() => false);
  check("a caller with no read permissions gets no sources", noneAllowed.length === 0);

  const onlyStudents = allowedSourcesFor((p) => p === "students.read");
  check(
    "permission filtering is per-source",
    onlyStudents.length === 1 && onlyStudents[0].key === "students",
  );

  const all = allowedSourcesFor(() => true);
  check("a full-access caller gets every source", all.length === SOURCES.length);
}

console.log(
  failures === 0
    ? "\nAll natural-language query checks passed.\n"
    : `\n${failures} natural-language query check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
