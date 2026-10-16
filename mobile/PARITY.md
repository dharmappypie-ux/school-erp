# App ↔ web parity

What the Flutter app covers, measured against the web console's own navigation
(`src/lib/navigation.ts`) rather than against a wish list. Every row below is a
screen in the app backed by a real `/api/mobile/v1/**` endpoint — the app is not
a viewer over a subset.

## One sign-in, five experiences

There is a single login screen for every kind of account, exactly as on the
web. Nothing is picked by hand: the account's roles decide which experience
opens, so an account can never reach a surface its roles do not grant.

| Backend role key | Experience | Shell |
|---|---|---|
| `PLATFORM_ADMIN` | Platform owner | Schools console (cross-tenant) |
| `SUPER_ADMIN`, `ADMIN`, `PRINCIPAL`, `ACCOUNTANT`, `LIBRARIAN`, `TRANSPORT_MANAGER`, `HOSTEL_WARDEN`, `RECEPTIONIST` | School staff | Staff console |
| `TEACHER` | Teacher | Class tools |
| `STUDENT` | Student | Portal |
| `PARENT` | Parent / guardian | Portal |

Within the staff console the module grid is filtered **by permission**, the way
the web sidebar is — an accountant sees fees, expenses and payroll and no
student roll, without this app knowing what an accountant is. The server
authorises every request regardless; the filtering is UX, not the security
boundary.

A user holding more than one role opens the most capable experience, mirroring
the web's `resolveHomeRoute`.

## Portal — student and guardian

Matches `PORTAL_NAV`, plus five the web portal does not have.

| Module | Endpoint |
|---|---|
| Attendance | `parent/module/attendance` |
| Results | `parent/module/results` |
| Report cards | `parent/module/reportcards` |
| Homework (submit + attachments) | `parent/homework/list`, `parent/homework/submit` |
| Timetable | `parent/module/timetable` |
| Courses (lessons, progress) | `parent/courses`, `parent/lesson/complete` |
| Quizzes (attempt, review) | `parent/quizzes`, `parent/quiz/attempt` |
| Learning plan | `parent/learning-plan` |
| Fees (invoices, receipts) | `parent/fees` |
| Leave (request, cancel) | `parent/leave`, `parent/leave/cancel` |
| Transport | `parent/module/transport` |
| Library | `parent/module/library` |
| Notices | `parent/module/notices` |
| Messages | `messages/threads`, `messages/send` |

## Staff console

Every item in `NAV_GROUPS`, with the permission that reveals it.

| Web sidebar | App module | Permission | Endpoint |
|---|---|---|---|
| Dashboard | Home | — | `admin/overview` |
| Students | Students | `students.read` | `admin/students`, `admin/student/{id}` |
| Staff | Staff | `staff.read` | `admin/staff`, `admin/staff/{id}` |
| Admissions | Admissions | `admissions.read` | `admin/admissions`, `admin/admissions/enrol` |
| Import students | Import students | `students.create` | `admin/import/students` |
| Import staff | Import staff | `staff.create` | `admin/import/staff` |
| Promotion | Promotion | `students.update` | `admin/promote` |
| Behaviour | Behaviour | `behaviour.read` | `admin/behaviour` |
| Careers | Careers | `careers.read` | `admin/careers` |
| Classes & subjects | Classes & subjects | `academics.read` | `admin/module/classes`, `admin/subject` |
| Attendance | Attendance | `attendance.read` | `admin/module/attendance`, `teacher/attendance` |
| Timetable | Timetable | `timetable.read` | `admin/timetable` |
| Examinations | Examinations | `exams.read` / `marks.read` | `admin/exams`, `teacher/exams/marks` |
| Report cards *(detail)* | Report cards | `reportcards.read` | `admin/reportcards`, `admin/reportcards/{id}` |
| Homework | Homework | `homework.read` | `teacher/homework`, `teacher/homework/grade` |
| Courses | Courses | `lms.read` | `admin/courses` |
| Quizzes | Quizzes | `quiz.read` | `admin/quizzes` |
| Fees | Fees | `fees.read` | `admin/fees/structures`, `admin/payment` |
| — *(the web's `/fees/payments`)* | Payments | `fees.report` / `fees.collect` | `admin/payments` |
| Expenses | Expenses | `expenses.read` | `admin/expense` |
| Payroll | Payroll | `payroll.read` | `admin/payroll`, `admin/payroll/run` |
| Transport | Transport | `transport.read` | `admin/transport` |
| Library | Library | `library.read` | `admin/library/*` |
| Hostel | Hostel | `hostel.read` | `admin/hostel/*` |
| Inventory | Inventory (+ item detail & movement ledger) | `inventory.read` | `admin/inventory/items`, `admin/inventory/item/{id}` |
| Leave | Leave | `leave.read` / `leave.apply` | `admin/leave`, `admin/leave/decide` |
| Student leave | Student leave | `studentleave.read` / `.approve` | `admin/student-leave` |
| — *(the web's `/attendance/devices`)* | Attendance devices | `school.settings` | `admin/devices` |
| Notices | Notices | `notices.read` | `admin/notices`, `admin/notice` |
| Messages | Messages | `messages.use` | `messages/*` |
| Broadcasts | Broadcasts | `notifications.send` | `admin/broadcast` |
| Analytics | Analytics | `analytics.read` | `admin/analytics` |
| AI insights | AI insights | `ai.insights` | `admin/insights` |
| Ask your data | Ask your data | `ai.query` | `admin/ask` |
| Reports | Reports | `reports.build` | `admin/reports`, `admin/reports/run` |
| Siblings | Siblings | `students.read` | `admin/siblings` |
| Settings | Settings | `school.read` | `admin/settings` |
| Users & roles | Users | `users.read` | `admin/users` |
| Users & roles | Roles & permissions | `roles.manage` | `admin/roles` |
| Audit log | Audit log | `audit.read` | `admin/audit` |
| — *(inside the web's Settings)* | Academic years | `academicyear.manage` | `admin/years` |

## Platform owner

Matches `PLATFORM_NAV`. A platform owner provisions and bills schools; a
school's internal data is deliberately unreachable from this surface.

| Capability | Endpoint |
|---|---|
| Every tenant, with students/staff roll-ups | `platform/schools` |
| Provision a school (roles, first academic year, first super admin + one-time password) | `POST platform/schools` |
| One school's profile, plan and administrators | `platform/schools/{id}` |
| Change a school's subscription tier | `POST platform/schools/{id}` |
| Switch a whole tenant on or off | `POST platform/schools/{id}` |
| Add an administrator | `POST platform/schools/{id}/admins` |
| Promote/demote, suspend, or re-issue a password | `POST platform/schools/{id}/admins/{userId}` |

Gated on the `PLATFORM_ADMIN` role key, never on a permission — the `"*"`
wildcard every school super admin holds does not unlock it.

## Shared rules, one implementation

Where a rule is dangerous to get twice, the two surfaces call the same code
rather than each keeping a copy:

| Rule | Shared module |
|---|---|
| Provisioning a tenant, cross-school admin management | `src/lib/platform.ts` |
| End-of-year promotion (one transaction, capacity and lock guards) | `src/lib/promotion.ts` |
| Student bulk import (preview, re-validate, plan cap, capacity) | `src/lib/import-run.ts` |
| Staff bulk import (preview, one-time passwords, row cap) | `src/lib/staff-import-run.ts` |
| Plan-tier feature gating | `src/lib/entitlements.ts` |
| Permission catalogue and role presets | `src/lib/permissions.ts` |

## Known gaps

Honest list, so the marketing claim stays true:

- **Editing the school profile** is read-only in the app because it is
  read-only on the web too — neither surface wires `school.update`.
- **Bulk import** reads `.csv` and `.xlsx` from the device. The old binary
  `.xls` format is rejected on both surfaces.
