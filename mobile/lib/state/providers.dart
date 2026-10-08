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

/// The signed-in child's homework with submission state (live).
final studentHomeworkProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
    (ref) => ref.watch(apiProvider).getJson('/api/mobile/v1/parent/homework/list'));

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
