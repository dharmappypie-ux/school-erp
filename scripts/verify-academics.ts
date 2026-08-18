/**
 * Checks the curriculum rules in src/lib/academics.ts.
 *
 *   npx tsx scripts/verify-academics.ts
 *
 * This layer configures what the timetable and the report cards later consume.
 * A mistake here surfaces much later as "3 periods could not be placed" or a
 * subject nobody can pass, so the constraints are pinned down at the source.
 */

import {
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  safeFileName,
  safeImageName,
  sniffDocumentType,
  sniffImageType,
  validateDocumentUpload,
  validateImageUpload,
} from "../src/lib/uploads";
import {
  curriculumLoad,
  normaliseSubjectCode,
  teacherCommitments,
  validateMarks,
  validateSubjectCode,
  type CurriculumEntry,
} from "../src/lib/academics";

let failures = 0;

function check(label: string, passed: boolean, detail = "") {
  console.log(`[${passed ? "  ok  " : " FAIL "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

function entry(over: Partial<CurriculumEntry> = {}): CurriculumEntry {
  return {
    subjectId: "MAT",
    subjectName: "Mathematics",
    weeklyPeriods: 6,
    teacherId: "t1",
    ...over,
  };
}

console.log("\n— curriculum load —");
{
  // The seeded shape: 7 teaching periods a day over 6 days = 42 slots.
  const subjects: CurriculumEntry[] = [
    entry({ subjectId: "ENG", weeklyPeriods: 6 }),
    entry({ subjectId: "MAT", weeklyPeriods: 6 }),
    entry({ subjectId: "SCI", weeklyPeriods: 6 }),
    entry({ subjectId: "SST", weeklyPeriods: 4 }),
    entry({ subjectId: "HIN", weeklyPeriods: 4 }),
    entry({ subjectId: "CSC", weeklyPeriods: 3 }),
    entry({ subjectId: "PED", weeklyPeriods: 2 }),
    entry({ subjectId: "ART", weeklyPeriods: 2 }),
  ];
  const load = curriculumLoad(subjects, 7, 6);

  check("the seeded curriculum totals 33 periods", load.allocated === 33, `${load.allocated}`);
  check("capacity is periods per day times working days", load.capacity === 42);
  check("it fits inside the week", load.state === "UNDER", `${load.free} slots free`);
}

{
  const exact = curriculumLoad([entry({ weeklyPeriods: 42 })], 7, 6);
  check("filling the week exactly is not an over-allocation", exact.state === "EXACT");

  const over = curriculumLoad([entry({ weeklyPeriods: 43 })], 7, 6);
  check(
    "demand beyond the week is flagged as over-allocated",
    over.state === "OVER",
    "the timetable generator would otherwise report an unexplained shortfall",
  );
  check("free slots never go negative", over.free === 0);

  const empty = curriculumLoad([], 7, 6);
  check("a class with no subjects reads as empty", empty.state === "EMPTY");

  const noPeriods = curriculumLoad([entry()], 0, 6);
  check("no teaching periods means zero capacity", noPeriods.capacity === 0 && noPeriods.state === "OVER");
}

{
  const withGaps = curriculumLoad(
    [
      entry({ subjectId: "ENG", subjectName: "English", teacherId: null }),
      entry({ subjectId: "MAT", subjectName: "Mathematics", teacherId: "t1" }),
      entry({ subjectId: "ART", subjectName: "Art & Craft", teacherId: null }),
    ],
    7,
    6,
  );
  check(
    "subjects with no teacher are named",
    withGaps.unstaffed.length === 2 && withGaps.unstaffed.includes("English"),
    withGaps.unstaffed.join(", "),
  );
}

console.log("\n— teacher commitments —");
{
  const assignments = [
    { ...entry({ subjectId: "MAT", weeklyPeriods: 6, teacherId: "t1" }), sections: 2, teacherName: "Asha" },
    { ...entry({ subjectId: "SCI", weeklyPeriods: 6, teacherId: "t1" }), sections: 2, teacherName: "Asha" },
    { ...entry({ subjectId: "ENG", weeklyPeriods: 4, teacherId: "t2" }), sections: 1, teacherName: "Bala" },
  ];
  const load = teacherCommitments(assignments, 42);
  const asha = load.find((row) => row.teacherId === "t1");
  const bala = load.find((row) => row.teacherId === "t2");

  check(
    "a teacher's load multiplies by the number of sections",
    asha?.periods === 24,
    "6+6 periods across 2 sections each",
  );
  check("assignment count is tracked separately from periods", asha?.assignments === 2);
  check("a light load is labelled light", bala?.state === "LIGHT", `${bala?.periods} periods`);
  check("the heaviest teacher sorts first", load[0]?.teacherId === "t1");
}

{
  const overloaded = teacherCommitments(
    [{ ...entry({ weeklyPeriods: 30, teacherId: "t1" }), sections: 2, teacherName: "Asha" }],
    42,
  );
  check(
    "a teacher assigned more periods than the week contains is flagged",
    overloaded[0]?.state === "OVERCOMMITTED",
    `${overloaded[0]?.periods} periods against a 42-slot week`,
  );

  const heavy = teacherCommitments(
    [{ ...entry({ weeklyPeriods: 38, teacherId: "t1" }), sections: 1 }],
    42,
  );
  check("a near-full load is heavy, not overcommitted", heavy[0]?.state === "HEAVY");

  const unassigned = teacherCommitments(
    [{ ...entry({ teacherId: null }), sections: 1 }],
    42,
  );
  check("unstaffed subjects contribute to nobody's load", unassigned.length === 0);
}

console.log("\n— marks configuration —");
{
  check("a normal configuration is valid", validateMarks(100, 33).ok);

  const overPass = validateMarks(100, 120);
  check(
    "pass marks above the maximum are rejected",
    !overPass.ok,
    overPass.reason,
  );

  const equal = validateMarks(100, 100);
  check(
    "pass marks equal to the maximum are rejected",
    !equal.ok,
    "every student would need a perfect score",
  );

  const zeroMax = validateMarks(0, 0);
  check("a zero maximum is rejected", !zeroMax.ok, "the report card would divide by zero");

  const negative = validateMarks(100, -5);
  check("negative pass marks are rejected", !negative.ok);

  check("a zero pass mark is allowed", validateMarks(100, 0).ok, "some co-scholastic areas are ungraded");
}

console.log("\n— subject codes —");
{
  check("a code is upper-cased", normaliseSubjectCode("mat") === "MAT");
  check("punctuation and spaces are stripped", normaliseSubjectCode("c.s-c 1") === "CSC1");
  check("codes are capped at eight characters", normaliseSubjectCode("a".repeat(20)).length === 8);
  check("a one-character code is rejected", !validateSubjectCode("m").ok);
  check("a two-character code is accepted", validateSubjectCode("EN").ok);
  check("a code of only punctuation is rejected", !validateSubjectCode("--").ok);
}


console.log("\n— image upload validation —");
{
  const ok = validateImageUpload({ type: "image/png", size: 500_000 });
  check("a normal PNG is accepted", ok.ok && ok.extension === "png");

  const tooBig = validateImageUpload({ type: "image/png", size: 5_000_000 });
  check("an oversized image is rejected", !tooBig.ok, tooBig.reason);

  const empty = validateImageUpload({ type: "image/png", size: 0 });
  check("an empty file is rejected", !empty.ok);

  const wrongType = validateImageUpload({ type: "application/pdf", size: 1000 });
  check("a non-image type is rejected", !wrongType.ok, wrongType.reason);

  const svg = validateImageUpload({ type: "image/svg+xml", size: 1000 });
  check(
    "SVG is rejected",
    !svg.ok,
    "SVG can carry script, so it is not an acceptable avatar format",
  );
}

console.log("\n— magic-number sniffing —");
{
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  check("a PNG header is recognised", sniffImageType(png) === "image/png");

  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  check("a JPEG header is recognised", sniffImageType(jpeg) === "image/jpeg");

  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ]);
  check("a WebP header is recognised", sniffImageType(webp) === "image/webp");

  // A PHP web shell renamed to .png — the exact attack the sniff exists for.
  const shell = new Uint8Array([...Buffer.from("<?php system($_GET[0]); ?>")]);
  check(
    "a script renamed as an image is not recognised",
    sniffImageType(shell) === null,
    "declared type is never trusted on its own",
  );

  const tooShort = new Uint8Array([0x89, 0x50]);
  check("a truncated file is not recognised", sniffImageType(tooShort) === null);
}

console.log("\n— safe filenames —");
{
  const name = safeImageName("cmsv123abc", "png");
  check("a filename is built from the record id", name.startsWith("cmsv123abc-"));
  check("the extension is appended", name.endsWith(".png"));

  const traversal = safeImageName("../../etc/passwd", "png");
  check(
    "path traversal is stripped from the id",
    !traversal.includes("/") && !traversal.includes(".."),
    traversal,
  );

  let threw = false;
  try {
    safeImageName("../..", "png");
  } catch {
    threw = true;
  }
  check(
    "an id with nothing safe left is refused outright",
    threw,
    "rather than writing to an unpredictable path",
  );

  const twice = safeImageName("abc", "png");
  check("names differ between uploads so caches refresh", twice !== name);
}

console.log("\n— worksheet and submission uploads —");
{
  const pdf = validateDocumentUpload({ type: "application/pdf", size: 500_000 });
  check("a PDF worksheet is accepted", pdf.ok && pdf.extension === "pdf");

  const photo = validateDocumentUpload({ type: "image/jpeg", size: 2_000_000 });
  check(
    "a phone photo of written work is accepted",
    photo.ok,
    "most handed-in work is a photo, not a typed document",
  );

  const big = validateDocumentUpload({ type: "application/pdf", size: 20_000_000 });
  check("an oversized file is refused", !big.ok, big.reason);

  check(
    "documents get a larger allowance than avatars",
    MAX_DOCUMENT_BYTES > 2 * 1024 * 1024,
    `${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB`,
  );

  const empty = validateDocumentUpload({ type: "application/pdf", size: 0 });
  check("an empty file is refused", !empty.ok);

  const html = validateDocumentUpload({ type: "text/html", size: 1000 });
  check(
    "HTML is refused",
    !html.ok,
    "uploads are served from our own origin, so markup would be stored XSS",
  );

  const svg = validateDocumentUpload({ type: "image/svg+xml", size: 1000 });
  check("SVG is refused for documents too", !svg.ok);

  const zip = validateDocumentUpload({ type: "application/zip", size: 1000 });
  check("an archive is refused", !zip.ok);

  check(
    "no executable type is on the whitelist",
    !Object.keys(ALLOWED_DOCUMENT_TYPES).some((type) =>
      /html|javascript|svg|zip|octet/.test(type),
    ),
  );
}

console.log("\n— document sniffing —");
{
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0]);
  check("a PDF header is recognised", sniffDocumentType(pdfBytes) === "application/pdf");

  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  check("images still sniff correctly as documents", sniffDocumentType(jpegBytes) === "image/jpeg");

  const htmlBytes = new Uint8Array(
    [...'<html><script>'].map((c) => c.charCodeAt(0)),
  );
  check(
    "an HTML file named .pdf is caught by its bytes",
    sniffDocumentType(htmlBytes) === null,
    "the declared type is a claim; the bytes are the evidence",
  );

  const tooShort = new Uint8Array([0x25, 0x50]);
  check("a truncated file is refused", sniffDocumentType(tooShort) === null);
}

console.log("\n— attachment filenames —");
{
  const name = safeFileName("abc123", "pdf");
  check("a generated name keeps the record id", name.startsWith("abc123-"));
  check("and the extension", name.endsWith(".pdf"));

  let threw = false;
  try {
    safeFileName("../../etc/passwd", "pdf");
  } catch {
    threw = true;
  }
  check(
    "a traversal attempt cannot produce a filename",
    !threw ? !safeFileName("../../etc/passwd", "pdf").includes("..") : true,
    "the user's own filename is never used to build the path",
  );
}

console.log(
  failures === 0
    ? "\nAll academics and upload checks passed.\n"
    : `\n${failures} academics check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
