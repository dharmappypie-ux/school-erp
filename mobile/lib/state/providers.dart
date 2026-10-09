import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart'; // ChangeNotifierProvider (Riverpod 3)

import '../data/auth/auth_controller.dart';
import '../data/local/app_database.dart';
import '../data/models/models.dart';
import '../data/remote/api_client.dart';
import '../data/sync/sync_service.dart';

/// These three are created in `main()` and injected via ProviderScope
/// `overrides`, so the rest of the app depends only on the abstractions.
final dbProvider = Provider<AppDatabase>((_) => throw UnimplementedError());
final apiProvider = Provider<ApiClient>((_) => throw UnimplementedError());

final syncProvider = ChangeNotifierProvider<SyncService>((ref) {
  return SyncService(ref.read(dbProvider), ref.read(apiProvider));
});

final authProvider = ChangeNotifierProvider<AuthController>((_) {
  throw UnimplementedError();
});

// ---- data reads (from the local DB; invalidated after sync / writes) -----
final studentProvider = FutureProvider.autoDispose<Student?>(
    (ref) => ref.watch(dbProvider).student());

final invoicesProvider = FutureProvider.autoDispose<List<FeeInvoice>>(
    (ref) => ref.watch(dbProvider).invoices());

final noticesProvider = FutureProvider.autoDispose<List<AppNotice>>(
    (ref) => ref.watch(dbProvider).notices());

final prefsProvider = FutureProvider.autoDispose<List<Pref>>(
    (ref) => ref.watch(dbProvider).prefs());

final resultsProvider = FutureProvider.autoDispose<List<SubjectResult>>(
    (ref) => ref.watch(dbProvider).results());

final homeworkProvider = FutureProvider.autoDispose<List<HomeworkItem>>(
    (ref) => ref.watch(dbProvider).homework());

final coursesProvider = FutureProvider.autoDispose<List<CourseItem>>(
    (ref) => ref.watch(dbProvider).courses());

final attendanceProvider = FutureProvider.autoDispose<List<AttendanceDay>>(
    (ref) => ref.watch(dbProvider).attendanceDays());

// ---- teacher / admin API-backed reads (live, not offline-cached) ---------
final teacherOverviewProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/teacher/overview'));

final teacherClassesProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/teacher/classes'));

/// Students of one section, optionally pre-filled with a day's attendance.
final sectionStudentsProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, ({String sectionId, String? date})>((ref, arg) {
  return ref.watch(apiProvider).getJson(
    '/api/mobile/v1/teacher/students',
    query: {'sectionId': arg.sectionId, if (arg.date != null) 'date': arg.date},
  );
});

final adminOverviewProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/overview'));

final adminMetaProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/meta'));

final adminStudentsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/students'));

final adminStaffProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/staff'));

/// Staff leave requests (pending first) for the admin to approve/reject.
final adminLeaveProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/leave'));

/// The roll runs to hundreds and the students endpoint pages at 30, so the
/// search goes to the server rather than filtering one page locally. The key is
/// the *first* word only: the server ORs `contains` over firstName and lastName
/// separately, so "Aadhya Patel" as one string matches neither — the rest of
/// the words narrow the returned page on the client instead.
final rollSearchProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>?, String>((ref, firstWord) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/admin/students',
      query: {'q': firstWord, 'status': 'ACTIVE'});
});

/// The behaviour ledger — appreciation and concern alike, newest first.
final behaviourListProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/behaviour'));

/// Job postings. A reader without careers.manage sees only live adverts; the
/// endpoint decides that, not the client.
final careersListProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/careers'));

/// Student leave requests (pending first) for staff to approve/reject. Separate
/// from [adminLeaveProvider]: staff leave carries balances and salary effects,
/// a student's does not.
final studentLeaveProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/student-leave'));

/// The signed-in family's own leave requests, for the parent app.
final myLeaveProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/parent/leave'));

/// Fee structures that can be billed.
final feeStructuresProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/fees/structures'));

/// Recent receipts, for refunds.
final adminPaymentsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/payment'));

/// Library copies free to issue.
final libraryAvailableProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/library/available'));

/// Library copies currently on loan.
final libraryIssuedProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/library/issued'));

/// Notices with publish/pin state, for the admin to manage.
final adminNoticesProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/notices'));

/// Messaging (all roles).
final messageThreadsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/messages/threads'));

final messageThreadProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, threadId) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/messages/thread', query: {'threadId': threadId});
});

final messageRecipientsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/messages/recipients'));

/// Inventory stock items.
final inventoryItemsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/inventory/items'));

/// Quizzes with status + question count.
final adminQuizzesProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/quizzes'));

/// Academic years (current first).
final adminYearsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/years'));

/// Users + assignable roles, for user management.
final adminUsersProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/users'));

/// Admissions applications (with their next stages).
final adminAdmissionsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/admissions'));

/// One admission application's full detail (timeline, documents, enrol sections).
final adminAdmissionDetailProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, id) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/admin/admissions/$id');
});

/// Curriculum editor data: class levels, subjects, teachers + one class's mappings.
final adminCurriculumProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String?>((ref, classLevelId) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/admin/curriculum',
      query: classLevelId != null ? {'classLevelId': classLevelId} : null);
});

/// One course's authoring detail (lessons, resources, status).
final adminCourseDetailProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, id) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/admin/courses/$id');
});

/// One quiz's authoring detail (questions with answers, status).
final adminQuizDetailProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, id) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/admin/quizzes/$id');
});

/// Exam setup pickers: terms, class levels, subjects.
final adminExamSetupProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/exams/setup'));

/// One student's attendance history (rate, monthly, session log).
final studentAttendanceProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, id) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/admin/student/$id/attendance');
});

/// School analytics dashboard data (enrolment, attendance, academics, finance).
final adminAnalyticsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/analytics'));

/// Dropout-risk insights, optionally filtered by level.
final adminInsightsProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String?>((ref, level) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/admin/insights',
      query: level != null ? {'level': level} : null);
});

/// Report sources the admin can run, with their fields.
final adminReportsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/reports'));

/// Report cards, to publish.
final adminReportCardsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/reportcards'));

/// Payslips, to mark paid.
final adminPayrollProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/payroll'));

/// Hostel rooms + current allocations.
final adminHostelProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/hostel'));

/// Transport routes + stops.
final adminTransportProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/transport'));

/// Courses with lesson counts.
final adminCoursesProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/admin/courses'));

/// A class section's weekly timetable slots.
final timetableSlotsProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, sectionId) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/admin/timetable', query: {'sectionId': sectionId});
});

/// The signed-in child's homework with submission state (live).
final studentHomeworkProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/parent/homework/list'));

/// The child's fee record (totals, invoices with line items, receipts) — live.
final parentFeesProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/parent/fees'));

/// Published courses for the child's class, with their progress (live).
final parentCoursesProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/parent/courses'));

/// One course with its lessons + the child's completion.
final parentCourseProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, id) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/parent/courses/$id');
});

/// Published quizzes for the child's class, tagged available/completed (live).
final parentQuizzesProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/parent/quizzes'));

/// One quiz — runnable questions, or the full review once attempted.
final parentQuizProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, id) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/parent/quizzes/$id');
});

/// The child's personalized learning plan (headline, recs, tips) — live.
final learningPlanProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/parent/learning-plan'));

/// The teacher's homework with a to-grade tally (live).
final teacherHomeworkProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/teacher/homework/list'));

/// Exams the user can enter marks for (with their sections).
final teacherExamsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/teacher/exams'));

/// Roster + existing marks for one exam × section.
final examRosterProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, ({String examId, String sectionId})>((ref, a) {
  return ref.watch(apiProvider).getJson(
    '/api/mobile/v1/teacher/exams/roster',
    query: {'examId': a.examId, 'sectionId': a.sectionId},
  );
});

/// Submissions for one homework, for the teacher to grade.
final homeworkSubmissionsProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, homeworkId) {
  return ref.watch(apiProvider).getJson(
    '/api/mobile/v1/teacher/homework/submissions',
    query: {'homeworkId': homeworkId},
  );
});

/// Generic module reader — one endpoint per role serves every module's list.
/// `role` is the path segment ('admin' | 'teacher' | 'parent').
final moduleProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, ({String role, String name})>((ref, a) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/${a.role}/module/${a.name}');
});

/// Refreshes every local-data read — call after a sync completes or a write.
void refreshData(WidgetRef ref) {
  ref.invalidate(studentProvider);
  ref.invalidate(invoicesProvider);
  ref.invalidate(noticesProvider);
  ref.invalidate(prefsProvider);
  ref.invalidate(resultsProvider);
  ref.invalidate(homeworkProvider);
  ref.invalidate(coursesProvider);
  ref.invalidate(attendanceProvider);
}
