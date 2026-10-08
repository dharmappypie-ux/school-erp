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
   - **Remaining tail** (lower-frequency config / sensitive / complex — still web-only):
     - Users management (create/role/reset-password/status) — sensitive (role + last-admin guards); highest-value next.
     - Hostel allocate/vacate · Transport routes/stops · Timetable substitute · Courses + lessons.
     - Reports builder (dynamic sources) — complex, low mobile value.
4. Students edit + promote; Staff edit.
5. Fees generate invoices + refund.
6. Library issue/return.
7. Notices edit; Messages compose/reply; Broadcasts send.
8. Remaining operations (hostel/inventory/transport/timetable/quizzes/courses/users/reports).
