import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../modules/module_registry.dart';
import '../widgets/role_nav.dart';
import '../widgets/role_profile.dart';
import 'admin_home.dart';
import 'admin_staff.dart';
import 'admin_students.dart';
import 'create_staff.dart';
import 'create_student.dart';
import 'post_notice.dart';

class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({super.key});
  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  int _index = 0;

  static const _tabs = [
    NavItem(Icons.dashboard_rounded, Icons.dashboard_outlined, 'Home'),
    NavItem(Icons.apps_rounded, Icons.apps_outlined, 'Modules'),
    NavItem(Icons.school_rounded, Icons.school_outlined, 'Students'),
    NavItem(Icons.badge_rounded, Icons.badge_outlined, 'Staff'),
    NavItem(Icons.person_rounded, Icons.person_outline_rounded, 'Profile'),
  ];

  void _select(int i) => setState(() => _index = i);
  void _push(Widget s) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => s));

  @override
  Widget build(BuildContext context) {
    final name = ref.watch(authProvider).name ?? 'Administrator';
    return Scaffold(
      drawer: RoleDrawer(
        name: name,
        roleLabel: 'Admin',
        subtitle: 'School console',
        entries: [
          DrawerEntry(Icons.dashboard_rounded, 'Dashboard', AppColors.primary, () => _select(0)),
          DrawerEntry(Icons.apps_rounded, 'All modules', AppColors.teal, () => _select(1)),
          DrawerEntry(Icons.school_rounded, 'Students', AppColors.primary, () => _select(2)),
          DrawerEntry(Icons.badge_rounded, 'Staff', AppColors.teal, () => _select(3)),
          DrawerEntry(Icons.person_add_alt_1_rounded, 'Admit student', AppColors.good,
              () => _push(const CreateStudentScreen())),
          DrawerEntry(Icons.group_add_rounded, 'Add staff', AppColors.teal,
              () => _push(const CreateStaffScreen())),
          DrawerEntry(Icons.campaign_rounded, 'Post notice', AppColors.gold,
              () => _push(const PostNoticeScreen())),
          DrawerEntry(Icons.person_rounded, 'Profile', AppColors.muted, () => _select(4)),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: IndexedStack(
          index: _index,
          children: [
            AdminHomeScreen(onGoToStudents: () => _select(2), onGoToStaff: () => _select(3)),
            const ModulesTab(role: UserRole.admin),
            const AdminStudentsScreen(),
            const AdminStaffScreen(),
            const RoleProfileScreen(),
          ],
        ),
      ),
      bottomNavigationBar: AppBottomBar(index: _index, items: _tabs, onTap: _select),
    );
  }
}
