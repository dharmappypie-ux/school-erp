# Vidyalaya ERP

A multi-tenant school ERP built on Next.js 16, PostgreSQL and Prisma 7 — one
deployment serving many schools, with data isolation enforced at the query
layer rather than left to application discipline.

Comparable in scope to schoolerpindia.com and edunexttechnologies.com, with an
explainable dropout-risk model on top.

---

## Status

This is a working foundation with several modules completed end-to-end, not a
finished product. Read this table before planning around it.

| Area | Data model | UI | Notes |
|---|---|---|---|
| Multi-tenancy & isolation | ✅ | ✅ | Enforced by a Prisma extension; 16 automated isolation checks |
| Auth, sessions, RBAC | ✅ | ✅ | Login, lockout, 11 role presets, 80+ permissions |
| App shell & navigation | ✅ | ✅ | Permission-filtered nav, dark mode, responsive |
| Dashboard | ✅ | ✅ | Live aggregates across every module |
| Classes & subjects | ✅ | ✅ | Curriculum matrix, load validation, 27 unit checks |
| Students | ✅ | ✅ | Searchable list, 360° profile hub, photo upload, attendance history |
| Staff | ✅ | ✅ | Roster with filters, photo upload, teaching load and payroll |
| Admissions | ✅ | ✅ | Funnel pipeline, guarded stage transitions, enrolment conversion |
| Attendance | ✅ | ✅ | Daily register, marking, holiday/weekend detection |
| Fees & payments | ✅ | ✅ | Invoices, collection, allocation, defaulters, receipt ledger |
| Timetable | ✅ | ✅ | Clash-free auto-generation, class & teacher grids, 20 unit checks |
| Transport | ✅ | ✅ | Add/edit vehicles & routes, stops, compliance, GPS, 24 unit checks |
| Library | ✅ | ✅ | Add titles & copies, issue, return, live fines, 38 checks (with hostel) |
| Payroll | ✅ | ✅ | Payslip runs, LOP proration, structures, 30 checks (with leave) |
| Leave | ✅ | ✅ | Requests, transactional approval, balances, holidays |
| Hostel | ✅ | ✅ | Add blocks & rooms, allocate/vacate, gender-safe placement |
| Exams & marks entry | ✅ | ✅ | Per-paper progress, keyboard-driven mark sheet, range validation |
| Report cards | ✅ | ✅ | Generation, class rank, publishing, printable card; 31 unit checks |
| Parent & student portal | ✅ | ✅ | Relationship-scoped; multi-child switcher; 12 access checks |
| AI dropout risk | ✅ | ✅ | Explainable weighted model, per-factor breakdown |
| Notices | ✅ | ✅ | Draft/publish/withdraw, audience targeting, pinning |
| Broadcasts | ✅ | ✅ | Audience preview, SMS segmentation, delivery log, 32 checks |
| Direct messaging | ✅ | ✅ | Membership-scoped threads, unread counts, seeded conversations |
| Analytics | ✅ | ✅ | Enrolment, attendance, performance, receivables aging; 34 checks |
| Report builder | ✅ | ✅ | Whitelisted sources/fields/operators, CSV export; 39 checks |
| Natural-language query | ✅ | ✅ | Model fills the report whitelist, never writes SQL; 33 checks |

Routes without a UI resolve to an in-app page that states exactly what exists
and what does not, rather than a 404.

---

## Requirements

- Node.js 20+ (developed on 24)
- PostgreSQL 14+ (developed on 16)

## Getting started

```bash
npm install
```

Create the database:

```bash
createdb school_erp
```

Copy the environment template and fill it in:

```bash
cp docs/env.example.txt .env.local
```

> Every variable has a local-development fallback in `src/lib/env.ts`, so the
> app runs without `.env.local`. In production, `assertProductionEnv()` refuses
> to boot on the default `AUTH_SECRET` or `DATABASE_URL`.

> If `prisma init` left a `.env` containing a placeholder `mydb` URL, delete or
> replace it — both the app and the Prisma config detect and ignore that exact
> placeholder, but a real stale value there will shadow `.env.local`.

Apply migrations and load demo data:

```bash
npm run db:migrate && npm run db:seed
```

Start the server:

```bash
npm run dev
```

### Demo accounts

Password for every seeded account: `Password123`

| Role | Greenwood (rich data) | Sunrise (sparse) |
|---|---|---|
| Super admin | `admin@greenwood.edu.in` | `admin@sunrise.edu.in` |
| Principal | `principal@greenwood.edu.in` | `principal@sunrise.edu.in` |
| Accountant | `accounts@greenwood.edu.in` | `accounts@sunrise.edu.in` |
| Teacher | `teacher1@greenwood.edu.in` | `teacher1@sunrise.edu.in` |
| Librarian | `library@greenwood.edu.in` | `library@sunrise.edu.in` |

Greenwood is seeded with ~360 students, 26 staff, 20 sections, 44 admission
applications, 720 invoices, 16,200 attendance records, 2,160 marks, a
clash-free timetable, 3 bus routes and 2 hostel blocks. Sunrise is deliberately small, so
tenant isolation is visible by signing into each in turn.

---

## Architecture

### Tenant isolation

`School` is the tenant root. Rather than trusting every query to remember a
`schoolId` filter, `scopedDb(schoolId)` returns a Prisma client extension that
injects one automatically:

```ts
const db = scopedDb(session.schoolId);
await db.student.findMany();          // only this school's students
await db.student.create({ data });    // schoolId injected
```

Behaviour worth knowing:

- Reads and bulk writes **intersect** the tenant filter with the caller's
  filter (`AND`), so asking for another school's rows returns nothing rather
  than silently returning your own.
- `findUnique` is rewritten to `findFirst`, because Prisma only accepts unique
  fields in a `findUnique` where clause and the tenant condition could not
  otherwise be applied.
- Single-row writes (`update`/`delete`/`upsert`) merge the tenant filter flat,
  since their where clause must remain a unique selector.
- Compound unique selectors (`{ schoolId_key: { … } }`) are flattened into
  their component fields before the rewrite, because `findFirst` does not
  recognise Prisma's composite key names.
- Detail tables without a `schoolId` (invoice lines, route stops, payslip
  lines) pass through untouched — they reach their tenant through a required
  parent relation.

Verify it at any time:

```bash
npm run verify:tenancy
```

### Permissions

Flat `module.action` keys (`fees.collect`, `attendance.mark`) held on roles as a
string array. `"*"` and `"module.*"` wildcards are supported. Server components
call `requirePermission("fees.read")`, which redirects to an explanatory page
rather than throwing. Navigation is filtered by the same function, so users are
never shown a link they cannot open.

### The gap in automatic tenant scoping

`scopedDb` injects `schoolId` automatically, but **only for models that have
that column**. Join and detail tables — `StudentGuardian`, `BookCopy`,
`HomeworkSubmission`, `ClassSubject` — do not, so a query against one is scoped
only if the author filtered through a parent relation.

That gap produced a real cross-tenant leak. The broadcast composer counted
every school's guardians (402 instead of 362) because its filter reached the
`student` relation without naming `schoolId` — one school's administrator would
have messaged another school's parents.

`npm run verify:tenantqueries` reads the models carrying `schoolId` from
`schema.prisma` itself, finds every query against a model that lacks it, and
requires a `// tenant-safe:` comment stating how that query is bound to one
school. The comment is not the point; being forced to think about it is.

### Broadcast safety

Two rules that matter more than the rest, both in `src/lib/broadcast.ts`:

- **Duplicates collapse by identity and by destination.** A guardian with three
  children receives one message, not three, and two guardians sharing a
  household phone receive one between them. Getting this wrong is the fastest
  way to have a school's SMS sender flagged as spam.
- **Unreachable recipients are reported, never silently dropped.** "Sent to
  400" when 60 had no phone number is a lie the office would act on.

SMS is measured before sending: a single emoji or Devanagari character forces
Unicode encoding, cutting each segment from 160 characters to 70, so a message
that looks short can cost three times as much. The composer shows the segment
count and encoding before anyone presses send.

With no provider configured, messages are recorded as **queued**, never
"sent" — the delivery log does not overstate what happened.

### Route coverage

Three defects in this project were the same shape: a button pointing at a route
that was never built. They stayed invisible because the authenticated shell has
a catch-all (`[...notBuilt]`) which answers every unmatched URL — so nothing
ever 404s in a way anyone notices.

`npm run verify:routes` scans every `href`, form `action`, `redirect()` and
`router.push/replace` in `src/`, resolves each against the real routes under
`src/app`, and **treats catch-alls as non-matching**. A link that lands only on
the catch-all is reported as broken, with the file and line that renders it.

Links to modules whose UI is deliberately pending are excused — but that list is
read from the `PENDING` declaration in the catch-all page itself, not kept in a
second list here, so a module cannot be quietly excused without also being
declared as unbuilt to the user.

### Payroll and leave rules

Payroll decides what lands in someone's bank account, so the awkward parts are
settled explicitly in `src/lib/payroll.ts`:

- **Loss of pay prorates earnings only.** Statutory deductions such as
  professional tax are not reduced because someone took unpaid leave.
- **Percent-of-gross components resolve in a second pass** against the base
  gross. Including them in their own base would be circular, with each one
  inflating the number it derives from.
- **Net pay floors at zero**, never negative — a school does not bill an
  employee for turning up.
- **Payslips already marked paid are never regenerated.** Reissuing one after
  the money has left the bank would put the records out of step with the
  statements.

Leave counting excludes weekly offs and declared holidays inside the range — a
school does not deduct Sunday from a teacher's casual leave because the absence
spanned a weekend. Approval debits the balance in the *same transaction* as the
status change, so a balance cannot drift from the approvals that caused it, and
reversing an approval returns the days.

An unpaid leave type may exceed the balance; a paid one may not. That is
precisely what loss of pay means.

### Library and hostel rules

**Fines** are recomputed live from the due date rather than read off the row,
so an overdue debt keeps growing until the book is actually back. A returned
book is charged to its *return* date, not to now — otherwise the fine would
carry on rising after the book was on the shelf. Fines are capped so a
forgotten book cannot accrue an absurd debt, and comparisons are by whole days
so a book due today is not already overdue at 09:00.

An **overdue book cannot be renewed**: renewing one would quietly erase the
fine already owed and the borrower would never be prompted to settle it.

**Hostel placement is a safeguarding control, not a formatting concern.** A
gendered block accepts only matching residents. A student with no gender on
file, or recorded as `OTHER`, is *refused* a gendered block rather than guessed
at, and the office is told to place them explicitly. The hostel page re-checks
every existing allocation on render, so a placement made outside the app still
surfaces.

Occupancy is reported over 100% when a room or block is oversubscribed, never
clamped — that is precisely the number a warden needs to see.

### Transport safety rules

Two judgements in `src/lib/transport.ts` decide what the transport screens
shout about, and both default towards caution:

- **A missing certificate date is `UNKNOWN`, never `VALID`.** An unrecorded
  insurance expiry is a gap in the paperwork, and treating it as fine would
  hide exactly the vehicles most likely to be uninsured.
- **Overloading is reported, not clamped.** A route with more children than
  seats shows above 100% rather than capping at full — a bus carrying 55
  children in 45 seats is the single most important thing that screen can say.

Certificates are compared by whole days, so one expiring later today reads as
"expiring", not "expired". Renewals are flagged 30 days ahead.

Tracking distinguishes live (≤2 min), recent (≤15 min), stale, and no signal.
A stale position is labelled as last known rather than drawn as if the bus were
still there — a parent watching for a child's bus needs that difference.

The route map is plain inline SVG with coordinates normalised into a local
viewBox. A tile layer would require an external host this deployment cannot
assume, and the shape of the route plus the vehicle's place along it is what
the screen actually needs to convey.

### Theme: data colour and status colour never borrow from each other

Two decisions carry the visual design, both in `src/app/globals.css`:

**Surfaces are warm neutrals, not blue-grey.** This is a records system people
sit in front of all day; paper-toned greys read as documents, and they leave the
one saturated colour doing actual work.

**`--chart-*` encodes magnitude; `--success/--warning/--danger` encode state.**
The two scales never share a value. Painting a data series in "danger red" tells
the reader something is wrong when the data may only say "low" — and once mixed,
a chart can't be read without a key. So the grade distribution uses a single-hue
ordinal ramp (darker means higher) rather than the green-to-red it used to:
whether the school should worry is the pass-rate figure's job, not the bars'.

The ramps were **validated, not eyeballed** — one hue, monotone lightness,
visible step gaps, and the light end clearing 2:1 against its own surface, in
both themes. Dark is a separate set stepped for the dark surface, not an
inversion, because a flipped palette lands in the wrong lightness band. Five
grade bands rather than six because five is what the ramp fits with visible
gaps; merging the bottom two loses nothing, as the pass line is its own stat.

Status colours always ship with a text label, so none of them carries meaning by
colour alone.

### Admin add/edit runs the same rules as the unit tests

Transport, Library and Hostel are managed from the app — no database access
needed. The forms share `src/components/manage-form.tsx`, so the parts that are
easy to get wrong behave identically everywhere: a failed save echoes the
submitted values back rather than wiping the form, and the server's own message
is shown instead of a generic failure.

The domain rules are enforced in the server action, not the form, because a
form control is a convenience and not a control:

- **Vehicle registrations are unique per school**, compared after upper-casing
  and stripping spaces — `ka05 mh 9911` is caught as a duplicate of
  `KA05MH9911`.
- **A gendered hostel block refuses a mismatched student**, and one with no
  gender recorded is refused rather than defaulted — that decision needs a
  person. Capacity is checked separately, so a room cannot be overfilled.
- **A loan belongs to exactly one borrower** — both a student and a staff
  member selected is refused, as is neither.
- **A stop with students assigned cannot be deleted** — it would cascade their
  assignments into nothing.
- **Accession numbers are generated, never typed**, so the sequence has no
  duplicates or gaps.
- **Compliance dates left blank read as "unknown", never as valid.**

### Worksheets: the machine marks multiple choice and nothing else

A teacher can attach a worksheet file (PDF or scan) *and* draft questions in the
app. Multiple-choice questions carry an answer key, so the whole class is marked
with one click. Written questions are never marked automatically.

That boundary is deliberate. String-matching a written answer against a model
answer fails a correct paraphrase, and a teacher trusting the total would never
look. So:

- **Written answers are flagged, counted, and listed** against each student —
  never given a mark by the machine.
- **A recorded mark is the auto-marked part only.** A submission with review
  outstanding stays `SUBMITTED`, not `GRADED`, so a partial total is never
  mistaken for a finished one, and `pendingMarks` says how much is still with
  the teacher.
- **A question with no answer key is sent for review, not failed** — penalising
  a student for the teacher's omission would be worse than asking.
- **An unanswered multiple-choice scores zero without review** — a blank is
  decidable and shouldn't cost a click.
- **A student who skipped a written question is still queued.** The check
  creates the missing answer row rather than no-op updating one that was never
  there; without that they drop out of the queue silently.

Uploads (worksheets and handed-in scans) go through the same defence as avatars:
whitelisted types, magic-number sniffing, generated filenames. HTML is refused
outright — uploads are served from the app's own origin, so markup would be
stored XSS.

### Rate limiting bounds spend, not requests

`/ask` costs money per call, so it is limited before the model is reached — a
refused question never touches the Anthropic API. Two token buckets apply:
**30 questions/hour per user** (burst 5) and **300/hour per school** (burst 40).
The second exists because a per-user limit alone lets a tenant with fifty
accounts run up fifty times the bill.

Design notes worth knowing:

- **Buckets live in Postgres, not memory.** An in-memory counter would grant
  the full allowance per process and reset on deploy — useless for bounding a
  real bill. Each check runs in a transaction taking `SELECT … FOR UPDATE`, so
  two simultaneous requests cannot both spend the same token.
- **A refused request consumes nothing.** Otherwise a client retrying in a loop
  would hold its own bucket empty and never recover. Verified against the
  running app: five blocked attempts left `tokens` and `updated_at` untouched.
- **All-or-nothing across buckets.** If the user bucket would allow but the
  school bucket refuses, the user's token is not spent.
- **A backwards clock never removes tokens.** NTP correction or a restored
  snapshot would otherwise lock people out for no reason.
- **Misconfiguration fails closed** — a zero-capacity or zero-refill bucket
  refuses rather than reading as unlimited.

**What this does not do:** it bounds expensive work, not raw request volume. A
flood of requests still costs a session lookup and a log insert each. Put
request-rate limiting at the edge (proxy, CDN, or WAF) — an application-level
limiter cannot protect against traffic it has already parsed.

### Natural-language query: the model fills a form, it does not write SQL

Asking "which students have overdue fees?" does not hand a language model a
database. The model is given the *field registry* — source names, field names
and types — and asked to choose a source, some columns and some filters. Its
answer is then validated by `compileReport`, the same whitelist the report
builder uses, before anything runs.

That inversion is the design:

- **The model never sees school data.** Only field names and types go into the
  prompt. There is no record in the context to leak.
- **Its reply is untrusted input**, validated exactly like a form post. An
  invented field, an out-of-range enum, a source the caller lacks permission
  for — all rejected by the compiler, not partially honoured.
- **The reply cannot express a tenant.** `schoolId` is not a registry field, so
  a definition cannot mention it; `scopedDb` injects it underneath.
- **There is no free-text query field in the response schema.** The model has no
  way to express a query even if a prompt injection convinced it to try.
- **The interpretation is shown above the results** — source, columns, filters,
  sort — so a misreading is visible rather than a confident wrong table.
- **Without an API key it degrades to keyword matching** and says so on screen,
  rather than silently pretending to be a language model.

### The report builder is a whitelist, not a query language

A report definition is user-supplied, saved, shared and re-run later, so it is
treated as hostile input. It can express only a choice from fixed lists:

- **Sources, fields and operators are whitelisted.** A definition naming
  anything else — `passwordHash`, an unknown source, `gt` on a string — is
  rejected at compile time, never forwarded.
- **No string SQL is assembled**, so a filter value has nothing to break out
  of. `'; DROP TABLE students; --` compiles to an ordinary `contains`
  parameter and is only ever data.
- **Enum values are checked against their declared options**, and numbers and
  dates must parse.
- **The caller must hold the source's own permission** — `fees.read` to report
  on invoices. Without this the builder would be a side door to data the app
  otherwise withholds. Sharing a report shares the *definition*, never access.
- **Tenant scoping is not expressible.** The compiled query carries no
  `schoolId`; `scopedDb` injects it beneath this layer, so a definition cannot
  reach another school even if it tries.
- **Row limits are capped at 1000**, so a saved report cannot be edited into a
  full table dump — and a result that hits the cap says so, rather than
  presenting a partial answer as complete.

CSV export prefixes values beginning `=`, `+`, `-` or `@` with an apostrophe.
Without that, an exported report is a way to run code on whoever opens it in a
spreadsheet.

### Honest analytics

Dashboards mislead in predictable ways, so `src/lib/analytics.ts` refuses the
common ones rather than rendering them confidently:

- **A percentage change from a zero baseline is `null`, not infinite or 100%.**
  The UI shows "new" instead of a number nobody can act on.
- **Median is reported alongside mean** for fee balances, and when the mean
  runs well above the median the page says so — a handful of large debtors is
  not what a typical family owes.
- **Groups too small to compare are flagged, not hidden.** A section of three
  students tops or bottoms any average by chance; suppressing it would be its
  own distortion, so it is shown with its sample size and marked
  non-comparable.
- **Values outside every histogram band are counted, not dropped**, so the
  parts always add up to the whole.
- **An invoice due today is current**, not one day overdue — aging is measured
  in whole days.

### File uploads

Student and staff photos are written to `public/uploads` on the local
filesystem. That works on a VPS or a container with a persistent volume; a
serverless deployment needs object storage instead, and
`uploadPersonPhoto` in `src/lib/photo-actions.ts` is the single function to
swap. Students and staff share that one code path deliberately, so the checks
below cannot drift apart between them.

An uploaded file is attacker-controlled input, so three things are enforced:

- **The declared MIME type is never trusted.** The leading bytes are sniffed,
  and a mismatch is rejected — a PHP web shell renamed `photo.png` announces
  itself as an image and is refused on its contents.
- **SVG is not accepted**, because it can carry script.
- **The filename is built from the student id and a server-chosen extension**,
  never from the uploader's filename, so `../../etc/passwd` cannot escape the
  upload directory. An id with nothing safe left throws rather than writing to
  an unpredictable path.
- **Each subject has its own permission** — `students.update` for a pupil,
  `staff.update` for a colleague — so photo rights follow the record, not the
  feature.

Replacing a photo deletes the previous file, and the stored name carries a
suffix so a replaced image is visible immediately rather than served from cache.

### Curriculum constraints

`src/lib/academics.ts` is the configuration layer the timetable and report
cards both consume, so its constraints are checked where they can be explained
rather than surfacing later as a puzzle:

- **A class allocated more weekly periods than the week holds is flagged
  immediately.** Otherwise the timetable generator reports "3 periods could not
  be placed" and nobody knows why.
- **A teacher committed beyond a full week is flagged**, counting each section
  they teach separately — that is how the load is actually delivered.
- **Pass marks equal to or above the maximum are rejected**, since either would
  make the subject impossible to pass, and a zero maximum makes the report card
  divide by zero.
- **Co-scholastic subjects are created ungraded**, which is what keeps Art and
  PE out of the report card percentage. Setting it wrong at creation is only
  noticed at results time.

Changing the curriculum deliberately does *not* move lessons already scheduled
— the timetable has to be regenerated, and the UI says so.

### Timetable generation

`src/lib/timetable.ts` solves a constrained assignment: each section needs a
fixed number of periods per subject per week, and a teacher can only be in one
room at a time. It is greedy, most-constrained-first (heaviest-loaded teachers
placed while choice remains), with randomised restarts. Exact optimisation
would be far slower and buys nothing at school scale — 660 periods across 20
sections schedules in about 5ms.

The guarantee is narrow but absolute: **the output never contains a clash.**
Two passes run per lesson — the first respecting a cap of two periods of a
subject per day for a section, the second relaxing it — so a tight schedule
degrades into a lumpier timetable rather than a gap. When demand genuinely
exceeds the free cells, the generator reports the shortfall instead of emitting
an invalid grid, and `generateTimetableFor` refuses to persist anything that
still contains a conflict.

Generation is seeded, so the same input reproduces the same timetable; a
different seed explores a different arrangement.

Substitutions go through the same rule: a teacher already timetabled in that
period cannot be assigned as cover.

`npm run verify:timetable` covers conflict detection, a full 20-section school,
shared teachers under heavy contention, over-subscribed input, and determinism.

### Admissions and enrolment

Stage transitions are whitelisted in `src/lib/admissions.ts` rather than
free-form. An application cannot jump from SUBMITTED straight to ENROLLED,
because that would skip the fee and document checks the office relies on and
leave the audit trail unable to explain how a child got a seat.

`ENROLLED` is unreachable by a plain status change — it is only produced by
`enrolApplicant()`, which in **one transaction** creates the student, a
guardian, the link between them, portal logins for both (flagged
`mustChangePassword`), and the enrolment, then marks the application enrolled
and links it to the new student. If any step fails, nothing is created.

Before enrolling it checks that the section belongs to the current year, that
it matches the class applied for, and that it has a free seat. Admission
numbers follow the school's own `code` and are derived from the highest
existing number, so they stay correct across imports.

### The portal boundary

The parent/student portal is the one place where authorisation **cannot** be a
permission check: every parent holds the same permission, but each may see only
their own children. Access is decided by relationship instead —
`Guardian → StudentGuardian → Student`.

Consequences that matter:

- `PARENT` and `STUDENT` hold `portal.access` and almost nothing else. They
  deliberately do **not** hold `students.read`, `reportcards.read`, `fees.read`
  or `marks.read`; any of those would expose the entire school roll through the
  staff pages.
- Portal pages never read a student id straight from the URL. They go through
  `resolvePortalStudent()`, which rejects an id the viewer is not related to.
- A tampered `?child=` returns **404**, not a redirect — confirming the id
  exists would leak roll membership.
- Report cards are filtered on `isPublished: true` everywhere in the portal, so
  a draft the school is still preparing can never reach a family.

`npm run verify:portal` asserts all of the above, including that the roles
stored in the database still match the tightened presets.

### Sessions

Opaque random tokens in an `httpOnly` cookie; only a SHA-256 digest is stored,
so a database dump cannot be replayed as a live session. Failed logins are
counted per account and lock it for 15 minutes after 8 attempts. Login failures
return one generic message and burn a bcrypt comparison even when no account
exists, so accounts cannot be enumerated by response or timing.

### Money

All monetary columns are `Decimal(12,2)` and all arithmetic goes through
`Prisma.Decimal` — never JavaScript floats. Payment allocation, invoice status
transitions and late-fee calculation live in `src/lib/fees.ts` so the counter
UI, the gateway webhook and the nightly job settle an invoice identically.

### AI risk scoring

`src/lib/ai/risk.ts` is a transparent weighted model, not a black box — a school
acting on "this child may drop out" must be able to justify it:

| Signal | Max | Basis |
|---|---|---|
| Attendance | 35 | Attendance rate + consecutive-absence runs |
| Academic | 25 | Average marks + term-over-term decline |
| Fee arrears | 20 | Unpaid proportion + days overdue |
| Homework | 12 | Share of assignments not submitted |
| Conduct | 8 | Unreturned school property (proxy) |

Thresholds: 70+ critical, 50–69 high, 28–49 medium, below 28 low. A student
with too little data on a signal scores zero for it rather than being penalised
for the gap. Every score stores its factor breakdown, which the UI renders.

Scoring 360 students takes roughly half a second, using aggregate queries per
model rather than per-student queries.

### Grading and report cards

The rules that decide a grade live in `src/lib/grading-core.ts` — pure, with no
database access — so they can be unit-tested directly (`npm run verify:grading`,
31 checks). `src/lib/grading.ts` wraps them with the Prisma reads and writes.

Behaviour worth knowing:

- **Weightage is proportional.** Two papers weighted 30 and 70 produce a mark
  out of 100 regardless of each paper's own maximum.
- **Absence is not zero.** A student absent from every paper in a subject
  reports as absent; averaging a zero would punish a medical absence. Absence
  from *one* paper of several averages only the papers attempted.
- **Co-scholastic subjects are excluded** from the percentage and cannot fail a
  student — they are graded separately, as CBSE expects.
- **One subject below the pass mark fails the student**, which is how most
  Indian boards work; a high overall average does not rescue it.
- **Ranks are competition-style** (1, 2, 2, 4): ties genuinely share a rank.
- **Published cards are never silently overwritten.** Regenerating skips them
  and reports how many it left alone, so a card a parent has already seen
  cannot change underneath them.

### Notifications

`queueNotification()` persists to `notification_logs` first and dispatches
second, so nothing is lost when a provider is down. Adapters exist for SMTP,
MSG91 (SMS) and WhatsApp Cloud API. With no credentials configured, messages
are logged to the console and recorded as `QUEUED` — never falsely reported as
delivered.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run check` | Types + lint + tenant isolation |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | Load demo data (idempotent) |
| `npm run db:studio` | Browse the database |
| `npm run db:reset` | Drop, migrate and reseed |
| `npm run verify:tenancy` | Tenant isolation checks |
| `npm run verify:grading` | Grading rule unit checks |
| `npm run verify:portal` | Portal access-control checks |
| `npm run verify:timetable` | Timetable generator checks |
| `npm run verify:transport` | Transport compliance and capacity checks |
| `npm run verify:facilities` | Library circulation and hostel placement checks |
| `npm run verify:hr` | Payroll calculation and leave rule checks |
| `npm run verify:routes` | Every internal link resolves to a real page |
| `npm run verify:tenantqueries` | Unscoped-model queries explain their tenant binding |
| `npm run verify:broadcast` | Audience resolution and SMS sizing checks |
| `npm run verify:academics` | Curriculum, marks and image-upload checks |
| `npm run verify:analytics` | Trend, aging, distribution and ranking checks |
| `npm run verify:reports` | Report definition compilation and CSV safety |
| `npm run verify:nlquery` | Hostile model replies, injection, keyword fallback |
| `npm run verify:ratelimit` | Token-bucket arithmetic, clock skew, fail-closed |
| `npm run verify:collab` | Homework status/grading rules and thread membership |
| `npm run verify:worksheet` | Auto-marking boundary, answer keys, review flags |

---

## Before production

1. Set a real `AUTH_SECRET` (`openssl rand -base64 32`) and `DATABASE_URL`.
2. Add PostgreSQL row-level security as defence in depth behind `scopedDb`.
3. Put the biometric ingest endpoint behind the device API key already modelled
   on `BiometricDevice.apiKeyHash`.
4. Verify Razorpay/Stripe webhook signatures before trusting a payment.
5. Add rate limiting on `/login` and the public admission form.
6. Move `refreshRiskScores` and late-fee application to a scheduled job.
7. Configure object storage for `Document.fileUrl` and `public/uploads`.
8. Set `ANTHROPIC_API_KEY` to enable natural-language querying (it falls back
   to keyword matching without one). `/ask` is already rate limited per user
   and per school; `/login` and the public admission form are not — the
   `consumeAll` helper in `src/lib/rate-limit.ts` takes any named limits, so
   adding them is a few lines each.
9. Add edge/CDN request-rate limiting. The application limiter bounds spend,
   not request volume.
