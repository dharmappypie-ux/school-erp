import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../screens/attendance_screen.dart';
import '../screens/courses_screen.dart';
import '../screens/quizzes_screen.dart';
import '../screens/learning_plan_screen.dart';
import '../screens/fees_screen.dart';
import '../screens/notices_screen.dart';
import '../screens/results_screen.dart';
import '../admin/create_expense.dart';
import '../admin/admin_audit.dart';
import '../admin/admin_devices.dart';
import '../admin/admin_fees.dart';
import '../admin/admin_import.dart';
import '../admin/admin_library.dart';
import '../admin/admin_notices.dart';
import '../admin/admin_broadcast.dart';
import '../admin/admin_inventory.dart';
import '../admin/admin_payments_ledger.dart';
import '../admin/admin_promote.dart';
import '../admin/admin_quizzes.dart';
import '../admin/admin_roles.dart';
import '../admin/admin_settings.dart';
import '../admin/admin_siblings.dart';
import '../admin/admin_years.dart';
import '../admin/admin_users.dart';
import '../admin/admin_students.dart';
import '../admin/admin_staff.dart';
import '../admin/admin_classes.dart';
import '../admin/admin_admissions.dart';
import '../admin/admin_reportcards.dart';
import '../admin/admin_payroll.dart';
import '../admin/admin_hostel.dart';
import '../admin/admin_transport.dart';
import '../admin/admin_courses.dart';
import '../admin/admin_timetable.dart';
import '../admin/admin_analytics.dart';
import '../admin/admin_insights.dart';
import '../admin/admin_reports.dart';
import '../admin/admin_ask.dart';
import '../admin/admin_attendance.dart';
import '../admin/admin_leave.dart';
import '../admin/admin_student_leave.dart';
import '../admin/admin_behaviour.dart';
import '../admin/admin_careers.dart';
import '../screens/my_leave.dart';
import '../exams/exams_marks.dart';
import '../messages/messages_screen.dart';
import '../homework/student_homework.dart';
import '../homework/teacher_grading.dart';
import '../teacher/teacher_classes.dart';
import '../widgets/widgets.dart';
import 'module_list_screen.dart';

/// Which experience a module belongs to.
///
/// This is the split the web's `visibleNavigation` makes first, and for the
/// same reason: an administrator holding the `*` wildcard technically passes
/// the portal's `portal.access` check, but has no child to show — so the portal
/// tiles are not theirs no matter what they may do.
enum ModuleSurface {
  /// Student and guardian self-service.
  portal,

  /// A school's staff: filtered by permission, exactly like the web sidebar.
  staff,

  /// The platform owner, above any single school. It has no module grid: the
  /// owner's shell is the cross-tenant console itself, because a school's
  /// internal modules are deliberately not theirs to open.
  platform,
}

/// One feature/module the app can surface.
///
/// Visibility is decided the way the web console decides it: the surface must
/// match the signed-in experience, the account must hold at least one of
/// [permissions], and the school's plan must include [feature]. Nothing is
/// hard-coded per role — a role's permissions are the whole answer, so an
/// accountant sees fees and not payroll without this file knowing what an
/// accountant is.
class ModuleDef {
  final String key;
  final String label;
  final IconData icon;
  final Color color;
  final String section;
  final ModuleSurface surface;

  /// Any one of these is enough. Empty = visible to everyone on the surface.
  final List<String> permissions;

  /// The subscription feature that unlocks it, if any. Must match a Feature key
  /// in the server's `@/lib/entitlements`.
  final String? feature;

  const ModuleDef(
    this.key,
    this.label,
    this.icon,
    this.color,
    this.section, {
    this.surface = ModuleSurface.staff,
    this.permissions = const [],
    this.feature,
  });
}

/// Every module, grouped exactly like the web console's sidebar.
const kModules = <ModuleDef>[
  // ---- Portal (student / guardian) ---------------------------------------
  ModuleDef('attendance', 'Attendance', Icons.fact_check_rounded, AppColors.teal, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('results', 'Results', Icons.insights_rounded, AppColors.teal, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('reportcards', 'Report cards', Icons.description_rounded, AppColors.primary,
      'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('homework', 'Homework', Icons.menu_book_rounded, AppColors.gold, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('timetable', 'Timetable', Icons.calendar_month_rounded, AppColors.gold, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('courses', 'Courses', Icons.play_lesson_rounded, AppColors.good, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access'], feature: 'lms'),
  ModuleDef('quizzes', 'Quizzes', Icons.quiz_rounded, AppColors.teal, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access'], feature: 'lms'),
  ModuleDef('learningplan', 'Learning plan', Icons.auto_graph_rounded, AppColors.primary,
      'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('fees', 'Fees', Icons.account_balance_wallet_rounded, AppColors.good, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('leave', 'Leave', Icons.event_busy_rounded, AppColors.danger, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('transport', 'Transport', Icons.directions_bus_rounded, AppColors.gold, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access'], feature: 'transport'),
  ModuleDef('library', 'Library', Icons.local_library_rounded, AppColors.teal, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('notices', 'Notices', Icons.campaign_rounded, AppColors.gold, 'My school',
      surface: ModuleSurface.portal, permissions: ['portal.access']),
  ModuleDef('messages', 'Messages', Icons.forum_rounded, AppColors.teal, 'My school',
      surface: ModuleSurface.portal, permissions: ['messages.use']),

  // ---- Staff: People ------------------------------------------------------
  ModuleDef('students', 'Students', Icons.school_rounded, AppColors.primary, 'People',
      permissions: ['students.read']),
  ModuleDef('staff', 'Staff', Icons.badge_rounded, AppColors.teal, 'People',
      permissions: ['staff.read']),
  ModuleDef('admissions', 'Admissions', Icons.how_to_reg_rounded, AppColors.gold, 'People',
      permissions: ['admissions.read']),
  ModuleDef('importstudents', 'Import students', Icons.group_add_rounded, AppColors.good,
      'People',
      permissions: ['students.create']),
  ModuleDef('importstaff', 'Import staff', Icons.upload_file_rounded, AppColors.teal, 'People',
      permissions: ['staff.create']),
  ModuleDef('promote', 'Promotion', Icons.moving_rounded, AppColors.primary, 'People',
      permissions: ['students.update']),
  ModuleDef('behaviour', 'Behaviour', Icons.emoji_people_rounded, AppColors.teal, 'People',
      permissions: ['behaviour.read']),
  ModuleDef('careers', 'Careers', Icons.work_outline_rounded, AppColors.gold, 'People',
      permissions: ['careers.read']),

  // ---- Staff: Academics ---------------------------------------------------
  ModuleDef('classes', 'Classes & subjects', Icons.meeting_room_rounded, AppColors.primary,
      'Academics',
      permissions: ['academics.read']),
  ModuleDef('attendance', 'Attendance', Icons.fact_check_rounded, AppColors.teal, 'Academics',
      permissions: ['attendance.read']),
  ModuleDef('timetable', 'Timetable', Icons.calendar_month_rounded, AppColors.gold, 'Academics',
      permissions: ['timetable.read']),
  ModuleDef('exams', 'Examinations', Icons.assignment_turned_in_rounded, AppColors.primary,
      'Academics',
      permissions: ['exams.read', 'marks.read']),
  ModuleDef('homework', 'Homework', Icons.menu_book_rounded, AppColors.gold, 'Academics',
      permissions: ['homework.read']),
  ModuleDef('reportcards', 'Report cards', Icons.description_rounded, AppColors.primary,
      'Academics',
      permissions: ['reportcards.read']),
  ModuleDef('courses', 'Courses', Icons.play_lesson_rounded, AppColors.good, 'Academics',
      permissions: ['lms.read'], feature: 'lms'),
  ModuleDef('quizzes', 'Quizzes', Icons.quiz_rounded, AppColors.teal, 'Academics',
      permissions: ['quiz.read'], feature: 'lms'),

  // ---- Staff: Finance -----------------------------------------------------
  ModuleDef('fees', 'Fees', Icons.account_balance_wallet_rounded, AppColors.good, 'Finance',
      permissions: ['fees.read']),
  ModuleDef('payments', 'Payments', Icons.receipt_long_rounded, AppColors.teal, 'Finance',
      permissions: ['fees.report', 'fees.collect']),
  ModuleDef('expenses', 'Expenses', Icons.payments_rounded, AppColors.danger, 'Finance',
      permissions: ['expenses.read']),
  ModuleDef('payroll', 'Payroll', Icons.account_balance_rounded, AppColors.primary, 'Finance',
      permissions: ['payroll.read']),

  // ---- Staff: Operations --------------------------------------------------
  ModuleDef('transport', 'Transport', Icons.directions_bus_rounded, AppColors.gold,
      'Operations',
      permissions: ['transport.read'], feature: 'transport'),
  ModuleDef('library', 'Library', Icons.local_library_rounded, AppColors.teal, 'Operations',
      permissions: ['library.read']),
  ModuleDef('hostel', 'Hostel', Icons.night_shelter_rounded, AppColors.primary, 'Operations',
      permissions: ['hostel.read'], feature: 'hostel'),
  ModuleDef('inventory', 'Inventory', Icons.inventory_2_rounded, AppColors.gold, 'Operations',
      permissions: ['inventory.read']),
  ModuleDef('leave', 'Leave', Icons.event_busy_rounded, AppColors.danger, 'Operations',
      permissions: ['leave.read', 'leave.apply']),
  ModuleDef('studentleave', 'Student leave', Icons.event_available_rounded, AppColors.teal,
      'Operations',
      permissions: ['studentleave.read', 'studentleave.approve']),
  ModuleDef('devices', 'Attendance devices', Icons.fingerprint_rounded, AppColors.teal,
      'Operations',
      permissions: ['school.settings']),

  // ---- Staff: Engagement --------------------------------------------------
  ModuleDef('notices', 'Notices', Icons.campaign_rounded, AppColors.gold, 'Engagement',
      permissions: ['notices.read']),
  ModuleDef('messages', 'Messages', Icons.forum_rounded, AppColors.teal, 'Engagement',
      permissions: ['messages.use']),
  ModuleDef('broadcasts', 'Broadcasts', Icons.podcasts_rounded, AppColors.primary,
      'Engagement',
      permissions: ['notifications.send'], feature: 'broadcasts'),

  // ---- Staff: Intelligence ------------------------------------------------
  ModuleDef('analytics', 'Analytics', Icons.bar_chart_rounded, AppColors.primary,
      'Intelligence',
      permissions: ['analytics.read'], feature: 'analytics'),
  ModuleDef('aiinsights', 'AI insights', Icons.auto_awesome_rounded, AppColors.teal,
      'Intelligence',
      permissions: ['ai.insights'], feature: 'ai_insights'),
  ModuleDef('ask', 'Ask your data', Icons.chat_rounded, AppColors.primary, 'Intelligence',
      permissions: ['ai.query'], feature: 'ask_ai'),
  ModuleDef('reports', 'Reports', Icons.summarize_rounded, AppColors.gold, 'Intelligence',
      permissions: ['reports.build'], feature: 'reports'),
  ModuleDef('siblings', 'Siblings', Icons.family_restroom_rounded, AppColors.teal,
      'Intelligence',
      permissions: ['students.read']),

  // ---- Staff: Administration ----------------------------------------------
  ModuleDef('settings', 'Settings', Icons.settings_rounded, AppColors.primary,
      'Administration',
      permissions: ['school.read']),
  ModuleDef('users', 'Users', Icons.manage_accounts_rounded, AppColors.teal, 'Administration',
      permissions: ['users.read']),
  ModuleDef('roles', 'Roles & permissions', Icons.shield_rounded, AppColors.gold,
      'Administration',
      permissions: ['roles.manage']),
  ModuleDef('audit', 'Audit log', Icons.history_rounded, AppColors.teal, 'Administration',
      permissions: ['audit.read']),
  ModuleDef('years', 'Academic years', Icons.event_note_rounded, AppColors.gold,
      'Administration',
      permissions: ['academicyear.manage']),
];

const kSectionOrder = [
  'My school',
  'People',
  'Academics',
  'Finance',
  'Operations',
  'Engagement',
  'Intelligence',
  'Administration',
];

/// Which family of endpoints a role's generic module screens read.
String roleSegment(UserRole r) => r.apiSegment;

/// The surface a role sees.
ModuleSurface surfaceFor(UserRole role) => switch (role) {
      UserRole.owner => ModuleSurface.platform,
      UserRole.admin || UserRole.teacher => ModuleSurface.staff,
      UserRole.parent || UserRole.student => ModuleSurface.portal,
    };

/// Open the right screen for a module: a rich bespoke screen where one exists,
/// otherwise the generic data-backed list.
void openModule(BuildContext context, UserRole role, ModuleDef m) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => _screenFor(role, m)));
}

Widget _screenFor(UserRole role, ModuleDef m) {
  // Messaging is one screen for everyone — the endpoint scopes the threads.
  if (m.key == 'messages') return const MessagesScreen();

  if (role.isPortal) {
    return switch (m.key) {
      'attendance' => const AttendanceScreen(),
      'results' => const ResultsScreen(),
      'learningplan' => const LearningPlanScreen(),
      'homework' => const StudentHomeworkScreen(),
      'courses' => const CoursesScreen(),
      'quizzes' => const QuizzesScreen(),
      'fees' => const FeesScreen(pushed: true),
      'notices' => const NoticesScreen(pushed: true),
      'leave' => const MyLeaveScreen(),
      _ => ModuleListScreen(
          role: roleSegment(role), name: m.key, title: m.label, icon: m.icon),
    };
  }

  if (role == UserRole.teacher) {
    final bespoke = switch (m.key) {
      'homework' => const TeacherHomeworkScreen(),
      'exams' => const ExamsScreen(),
      // A teacher's "classes" and "attendance" are the same place: their own
      // sections, which is where a register is opened. The header follows the
      // tile, so tapping Attendance does not land on a screen titled Classes.
      'classes' => const TeacherClassesScreen(),
      'attendance' => const TeacherClassesScreen(title: 'Attendance'),
      'studentleave' => const AdminStudentLeaveScreen(),
      'behaviour' => const AdminBehaviourScreen(),
      _ => null,
    };
    if (bespoke != null) return bespoke;
    // Teachers hold lms.manage / quiz.manage / reportcards.generate, so they
    // get the same bespoke authoring screens as admins; the endpoints gate each
    // individual action.
    if (_teacherAuthoring.contains(m.key)) return _adminScreens[m.key]!();
    return ModuleListScreen(
        role: roleSegment(role), name: m.key, title: m.label, icon: m.icon);
  }

  final build = _adminScreens[m.key];
  if (build != null) return build();

  final create = _adminCreate[m.key];
  return ModuleListScreen(
    role: roleSegment(role),
    name: m.key,
    title: m.label,
    icon: m.icon,
    addLabel: create?.label,
    onAdd: create == null
        ? null
        : (ctx, _) =>
            Navigator.of(ctx).push(MaterialPageRoute(builder: (_) => create.builder())),
  );
}

/// Modules a teacher opens through the same bespoke screen as an admin.
/// Analytics and AI insights are read-only for them; the rest are authoring
/// screens whose write actions the server gates individually.
const _teacherAuthoring = {'courses', 'quizzes', 'reportcards', 'analytics', 'aiinsights'};

/// Staff modules that open a bespoke management screen (act, not just read).
final Map<String, Widget Function()> _adminScreens = {
  'students': () => const AdminStudentsScreen(),
  'staff': () => const AdminStaffScreen(),
  'classes': () => const AdminClassesScreen(),
  'attendance': () => const AdminAttendanceScreen(),
  'leave': () => const AdminLeaveScreen(),
  'studentleave': () => const AdminStudentLeaveScreen(),
  'behaviour': () => const AdminBehaviourScreen(),
  'careers': () => const AdminCareersScreen(),
  'exams': () => const ExamsScreen(),
  'fees': () => const AdminFeesScreen(),
  'payments': () => const AdminPaymentsLedgerScreen(),
  'library': () => const AdminLibraryScreen(),
  'notices': () => const AdminNoticesScreen(),
  'broadcasts': () => const BroadcastScreen(),
  'inventory': () => const AdminInventoryScreen(),
  'quizzes': () => const AdminQuizzesScreen(),
  'years': () => const AdminYearsScreen(),
  'users': () => const AdminUsersScreen(),
  'roles': () => const AdminRolesScreen(),
  'settings': () => const AdminSettingsScreen(),
  'audit': () => const AdminAuditScreen(),
  'devices': () => const AdminDevicesScreen(),
  'siblings': () => const AdminSiblingsScreen(),
  'promote': () => const AdminPromoteScreen(),
  'importstudents': () => const AdminImportScreen(kind: ImportKind.students),
  'importstaff': () => const AdminImportScreen(kind: ImportKind.staff),
  'admissions': () => const AdminAdmissionsScreen(),
  'reportcards': () => const AdminReportCardsScreen(),
  'payroll': () => const AdminPayrollScreen(),
  'hostel': () => const AdminHostelScreen(),
  'transport': () => const AdminTransportScreen(),
  'courses': () => const AdminCoursesScreen(),
  'timetable': () => const AdminTimetableScreen(),
  'analytics': () => const AdminAnalyticsScreen(),
  'aiinsights': () => const AdminInsightsScreen(),
  'reports': () => const AdminReportsScreen(),
  'ask': () => const AdminAskScreen(),
};

/// Staff modules that have an inline create flow, keyed by module key.
class _Create {
  final String label;
  final Widget Function() builder;
  const _Create(this.label, this.builder);
}

final Map<String, _Create> _adminCreate = {
  'expenses': _Create('Record', () => const CreateExpenseScreen()),
};

/// The modules this account may actually open, in sidebar order.
///
/// [can] answers the permission question — pass the auth controller's, so the
/// app and the server agree on what a role grants. A null [allowedFeatures]
/// means "plan unknown" (an offline session), in which case nothing is hidden
/// by plan and the server stays the real gate.
List<ModuleDef> visibleModules(
  UserRole role, {
  required bool Function(List<String>) can,
  Set<String>? allowedFeatures,
}) {
  final surface = surfaceFor(role);
  return kModules.where((m) {
    if (m.surface != surface) return false;
    if (!can(m.permissions)) return false;
    final feature = m.feature;
    if (feature == null || allowedFeatures == null) return true;
    return allowedFeatures.contains(feature);
  }).toList();
}

/// The grouped module grid for a role, as a list of section widgets that can be
/// embedded in any scroll view.
List<Widget> modulesSections(
  BuildContext context,
  UserRole role, {
  required bool Function(List<String>) can,
  Set<String>? allowedFeatures,
}) {
  final mine = visibleModules(role, can: can, allowedFeatures: allowedFeatures);
  final bySection = <String, List<ModuleDef>>{};
  for (final m in mine) {
    bySection.putIfAbsent(m.section, () => []).add(m);
  }
  return [
    for (final section in kSectionOrder)
      if (bySection[section] != null) ...[
        SectionLabel(section),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.55,
          children: [
            for (final m in bySection[section]!) _ModuleTile(role: role, module: m),
          ],
        ),
        const SizedBox(height: 18),
      ],
  ];
}

/// A self-contained, pushable "All modules" page for a role (gradient header +
/// back button).
class ModulesPage extends ConsumerWidget {
  const ModulesPage({super.key, required this.role});
  final UserRole role;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    return DetailScaffold(
      title: 'All modules',
      subtitle: 'Every ${role.label.toLowerCase()} feature',
      icon: Icons.apps_rounded,
      children: modulesSections(
        context,
        role,
        can: auth.canAny,
        allowedFeatures: auth.features,
      ),
    );
  }
}

/// The "Modules" bottom-nav tab: a hamburger header over the grouped grid.
/// Lives inside a shell Scaffold.
class ModulesTab extends ConsumerWidget {
  const ModulesTab({super.key, required this.role});
  final UserRole role;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
      children: [
        const AppScreenHeader(eyebrowText: 'Explore', title: 'All modules'),
        const SizedBox(height: 18),
        ...modulesSections(
          context,
          role,
          can: auth.canAny,
          allowedFeatures: auth.features,
        ),
      ],
    );
  }
}

class _ModuleTile extends StatelessWidget {
  const _ModuleTile({required this.role, required this.module});
  final UserRole role;
  final ModuleDef module;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: () => openModule(context, role, module),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
                color: module.color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(12)),
            child: Icon(module.icon, color: module.color, size: 22),
          ),
          Text(module.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
