# Mobile app ↔ Website feature parity

Goal: the mobile app must do everything the website does — **view, create, update,
respond, submit, check** — per role, so users can replace the web with the app.

This is the honest audit of **what the website does** (from its server actions) vs
**what the mobile app currently supports**. Updated as gaps are closed.

Legend: ✅ full (view + act) · 🟡 view only · ❌ not in app yet · (n/a) not for this role

Last updated: 2026-10-08

---

## How to read this
The website's real capabilities = the server actions in `src/app/(app)/<section>/actions.ts`.
The app's capabilities = bespoke screens + the generic read-only `ModuleListScreen`.
A section is only ✅ when the app can perform the section's **actions**, not just list data.

---

## ADMIN

| Section | Website can… | App today | Gap to close |
|---|---|---|---|
| Students | view, create, **edit, promote** | ✅ view + create · ❌ edit/promote | edit + promote screens |
| Staff | view, create, **edit** | ✅ view + create · ❌ edit | edit screen |
| Admissions | view, **move stage, enrol** | 🟡 view | move/enrol actions |
| Academics (classes/subjects) | create subject/class/section, **assign subject** | 🟡 view + ✅ create subject · ❌ class/section/assign | create class/section, assign |
| Attendance | **pick a class → mark/edit register → save** | 🟡 read-only totals only | **class-register screen (BUILDING)** |
| Exams | create term/exam, **enter marks, generate+publish cards** | 🟡 view | marks entry + card gen |
| Homework | view, create, **grade** | ✅ full (list + grade) | — |
| Fees | view, **collect payment**, generate invoices, refund | ✅ collect · ❌ invoices/refund | generate invoices, refund |
| Expenses | view, **record** | ✅ full | — |
| Payroll | **run payroll, mark paid** | 🟡 view | run + mark-paid |
| Leave | **approve / reject** | 🟡 read-only list | **approve/reject (BUILDING)** |
| Library | view, **issue, return**, add book | ✅ add book · ❌ issue/return | issue + return |
| Hostel | **blocks, rooms, allocate/vacate** | 🟡 view | allocate/vacate |
| Inventory | **categories, items, movements** | 🟡 view | create item + movement |
| Transport | **vehicles, routes, stops** | 🟡 view | route/stop editing |
| Timetable | **generate, substitute** | 🟡 view | substitute at least |
| Notices | view, create, **update** | ✅ create · ❌ edit | edit notice |
| Messages | **start thread, reply, mark read** | 🟡 view | compose + reply |
| Broadcasts | **preview, send** | 🟡 view | send broadcast |
| Quizzes | **create, questions, publish** | 🟡 view | create + publish |
| Courses (LMS) | **create, lessons, resources, status** | 🟡 view | create + lessons |
| Reports | **run, save, load, delete** | 🟡 view | run report |
| Analytics / AI insights | view, **refresh** | 🟡 view | refresh |
| Users | **create, change role, reset pw, status** | 🟡 view | user management |
| Settings (academic year) | **create year, set current** | ❌ | year management |

## TEACHER

| Section | Website can… | App today | Gap |
|---|---|---|---|
| Attendance | **mark/edit class register** | ✅ take attendance (own classes) | confirm edit works |
| Homework | create, **grade** | ✅ full | — |
| Exams/Marks | **enter marks** | 🟡 view | marks entry |
| Classes | view rosters | ✅ view | — |
| Leave | apply (own) | ❌ | apply-leave screen |
| Timetable | view | 🟡 view | — |

## PARENT / STUDENT

| Section | Website can… | App today | Gap |
|---|---|---|---|
| Homework | view, **submit** | ✅ full (submit) | — |
| Attendance | view own | ✅ view | — |
| Results / report cards | view own | ✅ view | — |
| Fees | view, (pay online) | ✅ view | online payment (future) |
| Courses | view, **mark lesson progress** | 🟡 view | lesson progress |
| Quizzes | **attempt** | 🟡 view | quiz attempt |
| Notices / messages | view, **reply** | 🟡 view | reply |

---

## Build order (highest value first)
1. ~~**Attendance class register (admin)** — pick class, mark/edit P/A/L, save.~~ ✅ DONE (verified on device)
2. ~~**Leave approve/reject (admin)**~~ ✅ DONE (verified on device)
3. ~~**Exams marks entry** (teacher/admin) — pick exam+section, enter/edit marks.~~ ✅ DONE
4. ~~**Students edit + promote; Staff edit**~~ ✅ DONE
5. ~~**Fees generate invoices + refund**~~ ✅ DONE
6. ~~**Library issue/return**~~ ✅ DONE
7. ~~**Notices publish/pin/unpin**~~ ✅ DONE
8. ~~**Messages compose/reply** (all roles)~~ ✅ DONE (verified on device)
9. ~~**Broadcasts send** (admin)~~ ✅ DONE
10. Operations grab-bag — partial:
   - ~~Inventory: add item + record movement~~ ✅ DONE
   - ~~Quizzes: create + publish/archive~~ ✅ DONE (questions still added on web)
   - ~~Academic years: create + set current~~ ✅ DONE
   - ~~Users management (create/role/reset-password/status)~~ ✅ DONE (with all web guards)
   - ~~Admissions (move through pipeline)~~ ✅ DONE
   - ~~Report cards (publish/unpublish)~~ ✅ DONE
   - ~~Payroll (mark paid)~~ ✅ DONE
   - ~~Hostel (allocate/vacate)~~ ✅ DONE
   - ~~Transport (routes + add stop)~~ ✅ DONE
   - ~~Courses (create; lessons on web)~~ ✅ DONE
   - **Rich detail pages** (Student/Staff/Class) matching the website ✅ DONE
   - ~~Timetable substitute~~ ✅ DONE (pick class → tap slot → date + substitute)
   - **Remaining (view-only on mobile, or web-only):**
     - Roles & permissions, Analytics, AI insights, Reports builder — inherently read-only / heavy; shown as data views.
     - Exam report-card *generation* and payroll *run* stay on web (heavy computation); mobile publishes/marks-paid.
4. Students edit + promote; Staff edit.
5. Fees generate invoices + refund.
6. Library issue/return.
7. Notices edit; Messages compose/reply; Broadcasts send.
8. Remaining operations (hostel/inventory/transport/timetable/quizzes/courses/users/reports).

## Student leave (Oct 2026)

Brought the web's student-leave flow to the app, both sides of it.

**API**
- `GET/POST /api/mobile/v1/parent/leave` — the family's own requests, and raising one.
- `POST /api/mobile/v1/parent/leave/cancel` — withdraw while still pending.
- `GET /api/mobile/v1/admin/student-leave` — the staff queue, pending first.
- `POST /api/mobile/v1/admin/student-leave/decide` — approve or reject.

The child is resolved from the session, never from the request body, so a guardian cannot
raise or withdraw leave for another family's child by editing a payload. Validation is
shared with the web through `src/lib/student-leave.ts` rather than reimplemented, so the
half-day arithmetic and the date rules cannot drift between the two clients.

**App**
- `lib/ui/screens/my_leave.dart` — parents and students: pick dates, choose the portion of
  the day, give a reason, withdraw while pending.
- `lib/ui/admin/admin_student_leave.dart` — staff: approve, or reject with the reason the
  server requires (asked for in the card rather than failing after the tap).
- `module_registry.dart`: `leave` is now visible to every role and branches by role —
  staff get the staff-leave desk, a family gets their own requests. `studentleave` is the
  new staff-only queue, open to teachers as well as admins.

**Half day in the register.** `take_attendance.dart` offered only P / A / L / Lv, so a
half day could never be marked even though the API already accepted `HALF_DAY`. Added as a
fifth chip (`½`). EXCUSED is deliberately left web-only: six chips squeeze the name column
too far on a phone, and it is the rarer case.

Verified against the running dev server with real tokens: half-day request (0.5 days,
leaving after period 2), duplicate-date refusal, half-day-across-a-span refusal,
reject-without-reason refusal, re-deciding refusal, and the permission boundaries — a
parent token gets 403 on both staff endpoints and cannot withdraw an approved request.
