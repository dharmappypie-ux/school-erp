import 'package:flutter/material.dart';

import '../../data/models/models.dart';
import '../../theme/app_theme.dart';
import '../screens/attendance_screen.dart';
import '../screens/courses_screen.dart';
import '../screens/quizzes_screen.dart';
import '../screens/learning_plan_screen.dart';
import '../screens/fees_screen.dart';
import '../screens/notices_screen.dart';
import '../screens/results_screen.dart';
import '../admin/create_expense.dart';
import '../admin/admin_fees.dart';
import '../admin/admin_library.dart';
import '../admin/admin_notices.dart';
import '../admin/admin_broadcast.dart';
import '../admin/admin_inventory.dart';
import '../admin/admin_quizzes.dart';
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
import '../admin/admin_attendance.dart';
import '../admin/admin_leave.dart';
import '../exams/exams_marks.dart';
import '../messages/messages_screen.dart';
import '../homework/student_homework.dart';
import '../homework/teacher_grading.dart';
import '../teacher/teacher_classes.dart';
import '../widgets/widgets.dart';
import 'module_list_screen.dart';

/// One feature/module the app can surface. `roles` decides which role sees it;
/// the grouped index renders them under `section` like the web sidebar.
class ModuleDef {
  final String key;
  final String label;
  final IconData icon;
  final Color color;
  final String section;
  final Set<UserRole> roles;
  const ModuleDef(this.key, this.label, this.icon, this.color, this.section, this.roles);
}

const _all = {UserRole.parent, UserRole.teacher, UserRole.admin};
const _staff = {UserRole.teacher, UserRole.admin};
const _admin = {UserRole.admin};
const _teacherAdmin = {UserRole.teacher, UserRole.admin};

/// The full catalogue, grouped exactly like the web console's sidebar.
const kModules = <ModuleDef>[
  // People
  ModuleDef('students', 'Students', Icons.school_rounded, AppColors.primary, 'People', _admin),
  ModuleDef('staff', 'Staff', Icons.badge_rounded, AppColors.teal, 'People', _admin),
  ModuleDef('admissions', 'Admissions', Icons.how_to_reg_rounded, AppColors.gold, 'People', _admin),
  // Academics
  ModuleDef('classes', 'Classes & subjects', Icons.meeting_room_rounded, AppColors.primary, 'Academics', _staff),
  ModuleDef('attendance', 'Attendance', Icons.fact_check_rounded, AppColors.teal, 'Academics', _all),
  ModuleDef('timetable', 'Timetable', Icons.calendar_month_rounded, AppColors.gold, 'Academics', _all),
  ModuleDef('exams', 'Examinations', Icons.assignment_turned_in_rounded, AppColors.primary, 'Academics', _staff),
  ModuleDef('results', 'Results', Icons.insights_rounded, AppColors.teal, 'Academics', {UserRole.parent}),
  ModuleDef('learningplan', 'Learning plan', Icons.auto_graph_rounded, AppColors.primary, 'Academics', {UserRole.parent}),
  ModuleDef('homework', 'Homework', Icons.menu_book_rounded, AppColors.gold, 'Academics', _all),
  ModuleDef('reportcards', 'Report cards', Icons.description_rounded, AppColors.primary, 'Academics', _all),
  ModuleDef('courses', 'Courses', Icons.play_lesson_rounded, AppColors.good, 'Academics', _all),
  ModuleDef('quizzes', 'Quizzes', Icons.quiz_rounded, AppColors.teal, 'Academics', _all),
  // Finance
  ModuleDef('fees', 'Fees', Icons.account_balance_wallet_rounded, AppColors.good, 'Finance', {UserRole.parent, UserRole.admin}),
  ModuleDef('expenses', 'Expenses', Icons.payments_rounded, AppColors.danger, 'Finance', _admin),
  ModuleDef('payroll', 'Payroll', Icons.account_balance_rounded, AppColors.primary, 'Finance', _admin),
  // Operations
  ModuleDef('transport', 'Transport', Icons.directions_bus_rounded, AppColors.gold, 'Operations', {UserRole.parent, UserRole.admin}),
  ModuleDef('library', 'Library', Icons.local_library_rounded, AppColors.teal, 'Operations', _all),
  ModuleDef('hostel', 'Hostel', Icons.night_shelter_rounded, AppColors.primary, 'Operations', _admin),
  ModuleDef('inventory', 'Inventory', Icons.inventory_2_rounded, AppColors.gold, 'Operations', _admin),
  ModuleDef('leave', 'Leave', Icons.event_busy_rounded, AppColors.danger, 'Operations', _teacherAdmin),
  // Engagement
  ModuleDef('notices', 'Notices', Icons.campaign_rounded, AppColors.gold, 'Engagement', _all),
  ModuleDef('messages', 'Messages', Icons.forum_rounded, AppColors.teal, 'Engagement', _all),
  ModuleDef('broadcasts', 'Broadcasts', Icons.podcasts_rounded, AppColors.primary, 'Engagement', _admin),
  // Intelligence
  ModuleDef('analytics', 'Analytics', Icons.bar_chart_rounded, AppColors.primary, 'Intelligence', _teacherAdmin),
  ModuleDef('aiinsights', 'AI insights', Icons.auto_awesome_rounded, AppColors.teal, 'Intelligence', _teacherAdmin),
  ModuleDef('reports', 'Reports', Icons.summarize_rounded, AppColors.gold, 'Intelligence', _admin),
  // Administration
  ModuleDef('users', 'Users', Icons.manage_accounts_rounded, AppColors.primary, 'Administration', _admin),
  ModuleDef('roles', 'Roles & permissions', Icons.shield_rounded, AppColors.teal, 'Administration', _admin),
  ModuleDef('years', 'Academic years', Icons.event_note_rounded, AppColors.gold, 'Administration', _admin),
];

const kSectionOrder = [
  'People', 'Academics', 'Finance', 'Operations', 'Engagement', 'Intelligence', 'Administration',
];

String roleSegment(UserRole r) => switch (r) {
      UserRole.admin => 'admin',
      UserRole.teacher => 'teacher',
      UserRole.parent => 'parent',
    };

/// Open the right screen for a module: a rich bespoke screen where one exists,
/// otherwise the generic data-backed list.
void openModule(BuildContext context, UserRole role, ModuleDef m) {
  Widget screen;
  if (m.key == 'messages') {
    screen = const MessagesScreen();
  } else if (role == UserRole.parent) {
    screen = switch (m.key) {
      'attendance' => const AttendanceScreen(),
      'results' => const ResultsScreen(),
      'learningplan' => const LearningPlanScreen(),
      'homework' => const StudentHomeworkScreen(),
      'courses' => const CoursesScreen(),
      'quizzes' => const QuizzesScreen(),
      'fees' => const FeesScreen(pushed: true),
      'notices' => const NoticesScreen(pushed: true),
      _ => ModuleListScreen(role: roleSegment(role), name: m.key, title: m.label, icon: m.icon),
    };
  } else if (role == UserRole.teacher && m.key == 'homework') {
    screen = const TeacherHomeworkScreen();
  } else if (role == UserRole.teacher && m.key == 'exams') {
    screen = const ExamsScreen();
  } else if (role == UserRole.teacher && m.key == 'classes') {
    screen = const TeacherClassesScreen();
  } else if (role == UserRole.teacher && m.key == 'attendance') {
    screen = const TeacherClassesScreen();
  } else if (role == UserRole.admin && _adminScreens.containsKey(m.key)) {
    screen = _adminScreens[m.key]!();
  } else {
    final create = role == UserRole.admin ? _adminCreate[m.key] : null;
    screen = ModuleListScreen(
      role: roleSegment(role),
      name: m.key,
      title: m.label,
      icon: m.icon,
      addLabel: create?.label,
      onAdd: create == null
          ? null
          : (ctx, _) => Navigator.of(ctx).push(MaterialPageRoute(builder: (_) => create.builder())),
    );
  }
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
}

/// Admin modules that open a bespoke management screen (act, not just read).
final Map<String, Widget Function()> _adminScreens = {
  'students': () => const AdminStudentsScreen(),
  'staff': () => const AdminStaffScreen(),
  'classes': () => const AdminClassesScreen(),
  'attendance': () => const AdminAttendanceScreen(),
  'leave': () => const AdminLeaveScreen(),
  'exams': () => const ExamsScreen(),
  'fees': () => const AdminFeesScreen(),
  'library': () => const AdminLibraryScreen(),
  'notices': () => const AdminNoticesScreen(),
  'broadcasts': () => const BroadcastScreen(),
  'inventory': () => const AdminInventoryScreen(),
  'quizzes': () => const AdminQuizzesScreen(),
  'years': () => const AdminYearsScreen(),
  'users': () => const AdminUsersScreen(),
  'admissions': () => const AdminAdmissionsScreen(),
  'reportcards': () => const AdminReportCardsScreen(),
  'payroll': () => const AdminPayrollScreen(),
  'hostel': () => const AdminHostelScreen(),
  'transport': () => const AdminTransportScreen(),
  'courses': () => const AdminCoursesScreen(),
  'timetable': () => const AdminTimetableScreen(),
};

/// Admin modules that have an inline create flow, keyed by module key.
class _Create {
  final String label;
  final Widget Function() builder;
  const _Create(this.label, this.builder);
}

final Map<String, _Create> _adminCreate = {
  'expenses': _Create('Record', () => const CreateExpenseScreen()),
};

/// The grouped module grid for a role, as a list of section widgets that can be
/// embedded in any scroll view.
List<Widget> modulesSections(BuildContext context, UserRole role) {
  final mine = kModules.where((m) => m.roles.contains(role)).toList();
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
class ModulesPage extends StatelessWidget {
  const ModulesPage({super.key, required this.role});
  final UserRole role;

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'All modules',
        subtitle: 'Every ${role.label.toLowerCase()} feature',
        icon: Icons.apps_rounded,
        children: modulesSections(context, role),
      );
}

/// The "Modules" bottom-nav tab: a hamburger header (opens the drawer) over the
/// grouped module grid. Lives inside a shell Scaffold.
class ModulesTab extends StatelessWidget {
  const ModulesTab({super.key, required this.role});
  final UserRole role;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
      children: [
        const AppScreenHeader(eyebrowText: 'Explore', title: 'All modules'),
        const SizedBox(height: 18),
        ...modulesSections(context, role),
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
