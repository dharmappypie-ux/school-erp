/**
 * Checks the report builder in src/lib/reports.ts.
 *
 *   npx tsx scripts/verify-reports.ts
 *
 * A report definition is user-supplied, saved, shared and re-run later. It is
 * therefore treated as hostile input: these checks assert that anything not on
 * the whitelist is refused, that filter values stay data, and that an exported
 * CSV cannot execute in a spreadsheet.
 */

import {
  compileReport,
  findSource,
  MAX_ROWS,
  OPERATORS_BY_TYPE,
  readCell,
  SOURCES,
  toCsv,
  type FieldSpec,
} from "../src/lib/reports";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

console.log("\n— registry —");
{
  check("sources are defined", SOURCES.length >= 5, `${SOURCES.length} sources`);
  check(
    "every source names a permission",
    SOURCES.every((source) => source.permission.length > 0),
    "so a report cannot read data the user could not open directly",
  );
  check(
    "every field declares a type with operators",
    SOURCES.every((source) =>
      source.fields.every((field) => OPERATORS_BY_TYPE[field.type]?.length > 0),
    ),
  );
  check("an unknown source is not found", findSource("secrets") === undefined);
}

console.log("\n— rejecting anything off the whitelist —");
{
  const unknownSource = compileReport({ source: "payroll_secrets", columns: ["x"] });
  check("an unknown source is refused", !unknownSource.ok);

  const unknownColumn = compileReport({
    source: "students",
    columns: ["admissionNo", "passwordHash"],
  });
  check(
    "a column outside the registry is refused",
    !unknownColumn.ok,
    !unknownColumn.ok ? unknownColumn.errors[0] : "",
  );

  const unknownFilterField = compileReport({
    source: "students",
    columns: ["admissionNo"],
    filters: [{ field: "passwordHash", operator: "contains", value: "$2a$" }],
  });
  check("a filter on an unregistered field is refused", !unknownFilterField.ok);

  const badOperator = compileReport({
    source: "students",
    columns: ["admissionNo"],
    filters: [{ field: "admissionNo", operator: "gt", value: "5" }],
  });
  check(
    "an operator not valid for the field type is refused",
    !badOperator.ok,
    "gt makes no sense on a string",
  );

  const badSort = compileReport({
    source: "students",
    columns: ["admissionNo"],
    sortBy: "salary",
  });
  check("sorting by an unregistered field is refused", !badSort.ok);

  const noColumns = compileReport({ source: "students", columns: [] });
  check("a report with no columns is refused", !noColumns.ok);
}

console.log("\n— values stay data —");
{
  // There is no string SQL to break out of; these are just filter values.
  const injection = compileReport({
    source: "students",
    columns: ["admissionNo"],
    filters: [
      { field: "firstName", operator: "contains", value: "'; DROP TABLE students; --" },
    ],
  });
  check(
    "a SQL-looking filter value compiles as an ordinary parameter",
    injection.ok,
    "nothing is concatenated, so there is nothing to escape",
  );
  if (injection.ok) {
    const condition = JSON.stringify(injection.where);
    check(
      "the value is carried verbatim inside a contains clause",
      condition.includes("DROP TABLE") && condition.includes("contains"),
    );
  }

  const badEnum = compileReport({
    source: "students",
    columns: ["admissionNo"],
    filters: [{ field: "status", operator: "equals", value: "SUPERUSER" }],
  });
  check(
    "an enum value outside its options is refused",
    !badEnum.ok,
    !badEnum.ok ? badEnum.errors[0] : "",
  );

  const badNumber = compileReport({
    source: "invoices",
    columns: ["invoiceNo"],
    filters: [{ field: "amountDue", operator: "gt", value: "abc" }],
  });
  check("a non-numeric value for a number field is refused", !badNumber.ok);

  const badDate = compileReport({
    source: "students",
    columns: ["admissionNo"],
    filters: [{ field: "admissionDate", operator: "before", value: "not-a-date" }],
  });
  check("an unparseable date is refused", !badDate.ok);
}

console.log("\n— compilation —");
{
  const compiled = compileReport({
    source: "students",
    columns: ["admissionNo", "firstName", "status"],
    filters: [
      { field: "status", operator: "equals", value: "ACTIVE" },
      { field: "firstName", operator: "startsWith", value: "A" },
    ],
    sortBy: "admissionNo",
    sortDirection: "desc",
    limit: 50,
  });

  check("a valid definition compiles", compiled.ok);
  if (compiled.ok) {
    check("the base filter is applied", compiled.where.deletedAt === null,
      "soft-deleted students stay excluded");
    check("filters are combined with AND", Array.isArray(compiled.where.AND));
    check("columns resolve to field specs", compiled.columns.length === 3);
    check("select is built", compiled.select.admissionNo === true);
    check("sort direction is honoured", JSON.stringify(compiled.orderBy) === '{"admissionNo":"desc"}');
    check("the limit is applied", compiled.take === 50);
  }
}

{
  // A relation field must select through its parent, not flatten.
  const nested = compileReport({
    source: "attendance",
    columns: ["className", "status"],
    filters: [{ field: "className", operator: "equals", value: "Class 5" }],
  });
  check("a relation column compiles", nested.ok);
  if (nested.ok) {
    check(
      "relation columns nest under select",
      JSON.stringify(nested.select).includes('"section":{"select":{"classLevel"'),
      JSON.stringify(nested.select),
    );
    check(
      "relation filters nest under where",
      JSON.stringify(nested.where).includes('"section":{"classLevel":{"name"'),
    );
  }
}

{
  const duplicated = compileReport({
    source: "students",
    columns: ["firstName", "firstName", "lastName"],
  });
  check(
    "duplicate columns collapse",
    duplicated.ok && duplicated.columns.length === 2,
  );
}

console.log("\n— row limits —");
{
  const huge = compileReport({ source: "students", columns: ["admissionNo"], limit: 999999 });
  check(
    "an excessive limit is capped",
    huge.ok && huge.take === MAX_ROWS,
    `capped at ${MAX_ROWS}, so a saved report cannot become a full table dump`,
  );

  const negative = compileReport({ source: "students", columns: ["admissionNo"], limit: -5 });
  check("a negative limit is refused", !negative.ok);

  const defaulted = compileReport({ source: "students", columns: ["admissionNo"] });
  check("a missing limit gets a default", defaulted.ok && defaulted.take === 100);
}

console.log("\n— valueless operators —");
{
  const isSet = compileReport({
    source: "students",
    columns: ["admissionNo"],
    filters: [{ field: "phone", operator: "isSet" }],
  });
  check("“is set” needs no value", isSet.ok);

  const missingValue = compileReport({
    source: "students",
    columns: ["admissionNo"],
    filters: [{ field: "firstName", operator: "contains" }],
  });
  check("an operator that needs a value refuses without one", !missingValue.ok);

  const blankValue = compileReport({
    source: "students",
    columns: ["admissionNo"],
    filters: [{ field: "firstName", operator: "contains", value: "   " }],
  });
  check("a whitespace-only value is refused", !blankValue.ok);
}

console.log("\n— CSV export —");
{
  const columns: FieldSpec[] = [
    { key: "name", label: "Name", type: "string", path: ["name"] },
    { key: "city", label: "City", type: "string", path: ["address", "city"] },
  ];
  const rows = [
    { name: "Aarav", address: { city: "Bengaluru" } },
    { name: 'He said "hi"', address: { city: "Pune, MH" } },
    { name: "=SUM(A1:A9)", address: { city: null } },
    { name: "+1 800 000", address: null },
  ];

  const csv = toCsv(columns, rows);
  const lines = csv.split("\n");

  check("a header row is written", lines[0] === "Name,City");
  check("nested paths are read", lines[1] === "Aarav,Bengaluru");
  check(
    "quotes and commas are escaped",
    lines[2] === '"He said ""hi""","Pune, MH"',
    lines[2],
  );
  check(
    "a formula is neutralised with a leading apostrophe",
    lines[3].startsWith("'=SUM"),
    "otherwise an exported report runs code when opened in a spreadsheet",
  );
  check("a leading plus is also neutralised", lines[4].startsWith("'+1 800 000"));
  check("a null relation reads as empty, not a crash", lines[4].endsWith(","));

  check(
    "readCell follows a path",
    readCell({ address: { city: "Delhi" } }, columns[1]) === "Delhi",
  );
  check(
    "readCell on a missing branch is null",
    readCell({}, columns[1]) === null,
  );
}

console.log(
  failures === 0
    ? "\nAll report builder checks passed.\n"
    : `\n${failures} report builder check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
