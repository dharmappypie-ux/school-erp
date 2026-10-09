# Chalkbox Pro — competitive gap analysis

**Source:** `chalkboxpro.in` demo tenant ("Chalkbox Demo School"), read-only, 2026-10-09.
**Scope caveat:** the demo session was scoped to a **Vice Principal** role, so the menu
observed covers Student / Career / Staff / Reports only. Fees, Examination, Library,
Transport and Accounts admin menus were **not** visible and are not assessed here.

**Status:** the field-depth, behaviour and careers items below are **shipped**
(migration `20261009172836_chalkbox_parity_statutory_behaviour_careers`). Everything
else remains open — see "Still open" at the end.

Comparison baseline: this repo's `src/app/(app)` route set and `prisma/schema.prisma`.

---

## Where we already win

Nothing in the observed Chalkbox surface matches these, and they are our moat:

- AI dropout-risk scoring (`RiskScore`, `AiInsight`) and natural-language data queries (`/ask`)
- LMS: courses, lessons, progress, quizzes with auto-marking
- Biometric device integration with attendance anomaly detection
- Inventory / stock movement
- Hostel management
- Payroll with salary structures and payslips
- Saved-report builder
- Multi-tenant platform console

---

## Tier 1 — statutory / high-value gaps

These are India-specific and block real schools. Ranked by pain.

### 1. Bulk student promotion (annual rollover)
Chalkbox: `promoteStudentOfClass`, `promotedStudentReport`, `studentPromotionStatusReport`.
Ours: `Enrollment.status` already carries `PROMOTED | RETAINED | TRANSFERRED | PASSED_OUT`
but there is **no bulk promote UI**. This is the single largest annual operation a school
performs; doing it one student at a time is unusable at 400+ students.
**Schema ready — UI only.**

### 2. Transfer Certificate / bonafide request workflow
Chalkbox: `generateDocumentRequest`, `modifyDocumentRequest`.
Ours: `Document` model *stores* a file with `kind = "TC"`, but there is no
request → approve → generate → issue pipeline. TC issuance is a legal obligation and a
constant front-office burden.
**Needs a new `DocumentRequest` model + print templates.**

### 3. Bulk student import from Excel/CSV
Chalkbox: `registrationExcelPlugin`.
Ours: **nothing** — no csv/xlsx path anywhere in `src/app/(app)`
(`src/lib/worksheet.ts` is quiz marking, unrelated).
This is the migration blocker: a school moving off another ERP cannot onboard.

### 4. LOC report (List of Candidates)
Chalkbox: `classWiseStudentsLocReport`.
CBSE board-exam registration export for classes IX–XII. Hard requirement for any
CBSE-affiliated school; no equivalent here.

### 5. CWSN / disability report
Chalkbox: `handicappedReport`.
Required for UDISE+ returns. Our `Student` model has `religion`, `category`,
`aadhaarNumber`, `bloodGroup` but **no disability field**.
**Needs a schema column.**

---

## Tier 2 — operational workflows

- **Staff task manager** — assign tasks with code, priority, due date, assignee
  (`taskAssignerPage`). No equivalent model here. Drives daily staff coordination.
- **Student behaviour / complaint diary** (`addComplaintDiary`). Zero hits in our codebase.
  Pairs naturally with our existing dropout-risk scoring as a signal source.
- **Bulk allotment screens** — transport by route/class/student (`studentBulkAllotment`,
  `bulkTransport`), concession (`addMultipleConcessionDetail`), roll numbers (`addRollNo`),
  class transfer (`classTransfer`). We have the underlying models for all of these;
  we lack the bulk-edit surface.
- **Class teacher assignment** as a first-class concept (`addClassTeacher`/`editClassTeacher`).
- **Previous-year fee arrears carry-forward** (`addPreviousFees`).

---

## Tier 3 — reports (cheap to build, high perceived value)

Chalkbox's real bulk is reports. Most of these are one query + one table against data we
already hold:

| Report | Chalkbox page | Our data |
|---|---|---|
| Sibling report | `siblingReport` | derivable via `StudentGuardian` |
| **Wrong contact number** | `wrongContactNoReport` | data hygiene — genuinely smart |
| Category / religion / community wise strength | several | `Student.category`, `.religion` |
| Gender / age wise strength | `genderWiseStrengthReport`, `ageWiseStrengthReport` | ✓ |
| House wise students | `houseWiseListReport` | **no `house` field on Student** |
| **Homework not assigned** | `homeworkNotAssignedSubjectsReport` | teacher-compliance monitor |
| Admission withdrawal | `admissionWithdrawalReport` | ✓ |
| Student photo drive (who lacks a photo) | `allSectionList` | ✓ |
| Staff birthday / anniversary | `staffBirthdayList`, `staffAnniversaryList` | needs DOB/DOJ surfacing |
| **Police verification status** | `empReportPoliceVerification` | statutory for staff; no field |
| Estimated fee projection | `feeEstimateReport` | ✓ |
| Inactive students / employees | `inactiveStudentReport` | ✓ |

Our saved-report builder may already cover several of these — worth checking before
building one-off pages.

---

## Tier 4 — platform / commercial

- **SMS + WhatsApp credit ledger.** Chalkbox shows "493 of 10000 messages used" and a
  separate WhatsApp credit balance. We have `NotificationLog` but **no credit accounting**.
  If messaging is ever billed or quota-capped, this is required.
- **Parent app adoption tracking.** Chalkbox surfaces "54 downloaded, 334 pending" on the
  principal dashboard — it turns app rollout into a visible number someone chases.
  Directly relevant to the Flutter app in `mobile/`.
- **Careers / jobs board** (`addJobs`, `viewJobs`, `expireJobReport`) — school recruitment postings.
- **Blocked app modules per student** (`studentModBlockReport`) — withhold results/app access,
  typically for fee defaulters.

---

## Smaller UI observations

- Academic **session switcher** is in the global header ("Session: 2026-2027"), not buried in settings.
- Attendance breakdown distinguishes **M.L. (medical leave) and P.L.** separately from plain absent.
- Birthday widget has a one-click **"Wish"** action that fires the message.
- Dashboard leads with four counters: total students, absent|leave today, overdue books, SMS sent today.


---

## Form-level findings (second pass, with the demo session)

### Student registration — `registration1.xhtml`

The single richest screen in the product. What it captures that a generic ERP does not:

**Statutory identifiers** — Child's Aadhaar, Permanent Education Number, UDISE No.,
**APAAR ID** (the national "One Nation One Student ID"), UBSE No., and *two separate*
CBSE/CISCE registration numbers for class IX and class XI, because board registration
happens twice.

**Equity and welfare flags** — BPL, EWS, minority, caste/category, any disability,
"special needs (dyslexic only)" tracked *separately* from physical disability (exam
boards grant different concessions), single parent, single child, child living with
parents, **ward of a teacher of this school** (automatic concession), and **parent is an
alumnus** with their session and admission number.

**Previous school** — name, class, medium, board, result, %age, reason to leave, and
**TC number + TC date**, plus a subject-wise table of last year's marks
(Subject / Max / Obtained / % / Remarks).

**Siblings, explicitly** — "Real Brother/Sister 1/2" with name, age and school attending.
This is how the Sibling Report gets built; it is captured at admission, not inferred.

**Medical** — height, weight, eyes (L/R), blood group, allergy/chronic ailment, medical
history.

**Parents in depth** — for each of father and mother: age, email, Aadhaar, qualification,
occupation, designation, **annual income**, office contact/fax/mobile/email/address,
"is school employee?", and a photo.

**Nice touch worth stealing:** the form computes and displays *"Student's age as on
01-04-2026 is …  Please check student's D.O.B and Class"* live — age against the
admission cut-off, right where the mistake would be made.

### Employee registration — `employeeAddmission.xhtml`

- **Named document slots**, not a generic uploader: Aadhaar, PAN, Voter ID, D/L,
  UG cert, PG cert, B.Ed. cert, **Police Verification**, Experience cert, Other.
- **Access Platform** per employee — WEB / MOBILE APP / BOTH / NONE. Access control as a
  field on the person, which is more legible to an office clerk than a role matrix.
- Statutory codes: **Oasis Id** (CBSE) and **Teacher National Code** (NCTE).
- `D/L No. (* for driver)` — conditionally mandatory by designation.
- Payroll: salary, DA, HRA, leaves allowed per year, PAN, Aadhaar, bank + IFSC, EPF UAN, ESI.
- Shift (1/2/3), marital status, father's/husband's name.

### Student Behaviour — `addComplaintDiary.xhtml`

Three-way, not a punishment log: **Complaint/Bad | Appreciation/Good | Neutral**, plus
description and who raised it. Recording praise in the same ledger is what keeps staff
using it.

### Careers — `addJobs.xhtml`

Category, title, description, key responsibilities, CV required Y/N, experience, last
date to apply. Auto-allocates a quotable reference (`CB-JOB…`) and flips to **Expired**
past the closing date.

### Global chrome

- **Downloaded Files tray** — long reports generate in the background and land in a
  per-user download list instead of blocking the page.
- **In-app support widget** — report an error / query / suggestion / request demo +
  screenshot upload, on every page.
- **Session switcher** and **school switcher** both in the header.
- Task Manager: progress %, Put On Hold, Mark as Completed, attachments, update log.

---

## Shipped in this pass

| Item | Where |
|---|---|
| Statutory student IDs — APAAR, PEN, UDISE, board reg IX/XI | `Student` model |
| Equity flags — BPL, EWS, RTE, minority, disability/CWSN, special needs, single parent/child, staff ward, alumni child | `Student` model |
| Admission context — place of birth, language at home, house, file no., previous TC no./date, previous board | `Student` model |
| Medical — height, weight, allergies, chronic ailment | `Student` model |
| Police verification status + date + reference | `StaffMember` model |
| Driving licence no. + expiry, OASIS ID, Teacher National Code, marital status, father's/husband's name | `StaffMember` model |
| Behaviour ledger (appreciation / concern / neutral, severity, guardian-notified queue, retract-not-delete) | `/behaviour` |
| Careers board (postings, references, draft→open→closed/filled, application counts) | `/careers` |

New permissions: `behaviour.read`, `behaviour.manage`, `careers.read`, `careers.manage`.

## Shipped in the second pass

- **Student edit form** now exposes the statutory IDs, equity flags, admission/previous-school
  and medical blocks. CWSN asks for the nature of the disability only once the flag is set,
  and clearing the flag clears the description with it.
- **Staff edit form** now exposes police verification (status, date, reference), driving
  licence and expiry, OASIS ID, Teacher National Code, marital status and father's/husband's
  name. Setting the status back to "not started" clears the date and reference, so an
  unverified employee can never look cleared.
- **Searchable student picker** (`src/components/student-picker.tsx`) — free-text search over
  name / admission no. / father, plus Chalkbox-style **Class** and **Section** dropdowns, with
  every row showing admission no., class-section and father's name. A 380-row `<select>` could
  not tell four students named Aadhya Patel apart; two of them share a section, so the father's
  name is the only disambiguator.
- **Bulk promotion** (`/students/promote`) — per-student Promote / Retain / Passed out /
  Transferred, capacity check with an explicit over-capacity override, and the whole run in
  one transaction. A student already placed in the target year is reported and skipped rather
  than aborting the batch.

## Shipped in the third pass

- **Bulk student import** (`/students/import`) — `.xlsx` and `.csv`, mandatory preview before
  any write, whole file in one transaction. Column headers are matched loosely ("Adm No",
  "Admission Number", "SR No" all resolve), unrecognised columns are reported rather than
  silently dropped, and siblings sharing a phone number get one guardian record, not two.
- **`src/lib/xlsx-reader.ts`** — a dependency-free `.xlsx` reader (ZIP walk +
  `DecompressionStream` + a small XML scan). Written rather than installed because the npm
  build of SheetJS is frozen at 0.18.5 with published prototype-pollution and ReDoS
  advisories, and ExcelJS brings Node stream/zlib shims that do not belong in a Workers
  bundle. It reads one sheet; it does not write .xlsx, and does not handle the old binary
  .xls, formulas, charts or encryption.
  Handles Excel date serials (a DOB cell is stored as `42239`, not a date), shared strings,
  inline-string runs, gapped columns, self-closing cells, and a first sheet that is not
  called `sheet1.xml`.

## Still open

Highest value first. The statutory fields are the prerequisite for the first one.

1. **LOC report** and **CWSN report** — now buildable, since the fields exist.
3. **TC / bonafide request workflow** — needs a `DocumentRequest` model + print templates.
4. **Sibling capture at admission** — needs its own model, not columns; Chalkbox asks for
   two named siblings with age and school at admission time.
5. **Student create form** (`/students/new`) — only the edit form exposes the new fields.
6. **Staff task manager**, **SMS/WhatsApp credit ledger**, **parent-app adoption tracking**.
7. The Tier 3 report list — check the saved-report builder covers them first.
8. **Roll-number re-sequencing** after promotion — rolls are carried forward as-is today.
9. **Staff leave applications** — staff still cannot apply; only `decideLeave` exists.
   The student flow shipped this pass is the model to copy.
10. **Approved leave → attendance** — an approved request should pre-fill the register.

## Leave: what was actually there, and what was built

The original finding was half right and worth restating correctly.

**Students had no leave at all** — `LeaveRequest.staffId` is non-nullable and points at
`StaffMember`, the portal had no leave route, and the mobile API exposed only `admin/leave`.

**Staff could not apply either.** The only `leaveRequest.create` in the whole codebase was
in `prisma/seed.ts`. `/leave` rendered balances, types and holidays; `actions.ts` held only
`decideLeave`. The approval half existed and the application half had never been built —
the seed created requests so the approve screen had something to show.

Shipped in this pass (`StudentLeaveRequest`, migration `20261009184020`):

- **`/portal/leave`** — a guardian or student picks dates, a portion of the day and a reason,
  and can withdraw while it is still pending. Overlapping requests are refused rather than
  queued twice. The child is resolved from the session, never from a form field, so a
  guardian cannot book leave for someone else's child by editing a hidden input.
- **`/leave/students`** — staff see pending first, with class, admission number and who
  asked; approve, or reject with a reason that is required rather than optional.
- **Half days are first class.** `LeavePortion` is FULL_DAY / FIRST_HALF / SECOND_HALF, a
  half day counts 0.5 in the arithmetic, it is only offered on a single-date request, and
  `leavingAfterPeriod` records that the student goes after period 2 or at recess.
- **`HALF_DAY` is now markable.** It was in the enum and accepted by the server, but the
  attendance sheet only ever offered Present / Absent / Late / Leave — so no teacher could
  record a half day. Half day and Excused now have buttons.

Still missing: approved leave does not yet write itself into the register, so a teacher
still marks the day. That is the obvious next step and the reason `leavingAfterPeriod`
is captured.


## Also shipped

- **4-hour sessions and a real expiry page.** `SESSION_TTL_HOURS` dropped from 12 to 4, and
  `requireAuth` now distinguishes a timed-out session from an anonymous visitor by the
  presence of the cookie: the first gets `/session-expired`, which explains what happened
  and clears the dead cookie on the way back to sign-in; the second goes straight to
  `/login`.
- **`npm run sync:roles`.** Roles were written from `ROLE_PRESETS` only when a school is
  seeded or created, so a permission added to a preset afterwards reached nobody — every
  permission added this session was invisible to both existing schools. The script reports
  by default and writes with `--apply`, and is additive: a school that has tailored a role
  keeps its change. Its first run also found pre-existing drift — `attendance.mark` and
  `attendance.manage` were missing from ADMIN and PRINCIPAL.
- **Idle Postgres connections are released** (`idleTimeoutMillis`). Turbopack rebuilds the
  module graph on each hot reload and the `globalThis` singleton does not always survive it,
  so stale pools held three connections each until Postgres refused new ones.
