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

/// The school-staff shell — for every staff role, not only an administrator.
///
/// An accountant, librarian, transport manager or front-desk user signs in
/// here too, so the tabs and the drawer are built from what the account may
/// actually do. Offering a Students tab to someone without `students.read`
/// would be a tab that can only ever show a refusal.
class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({super.key});
  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  int _index = 0;

  void _select(int i) => setState(() => _index = i);
  void _push(Widget s) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => s));

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final name = auth.name ?? 'Administrator';
    final canReadStudents = auth.can('students.read');
    final canReadStaff = auth.can('staff.read');

    // Home and Modules are always there; the rest earn their place.
    final tabs = <NavItem>[
      const NavItem(Icons.dashboard_rounded, Icons.dashboard_outlined, 'Home'),
      const NavItem(Icons.apps_rounded, Icons.apps_outlined, 'Modules'),
      if (canReadStudents)
        const NavItem(Icons.school_rounded, Icons.school_outlined, 'Students'),
      if (canReadStaff) const NavItem(Icons.badge_rounded, Icons.badge_outlined, 'Staff'),
      const NavItem(Icons.person_rounded, Icons.person_outline_rounded, 'Profile'),
    ];
    final pages = <Widget>[
      AdminHomeScreen(
        onGoToStudents: canReadStudents ? () => _select(2) : null,
        onGoToStaff: canReadStaff ? () => _select(canReadStudents ? 3 : 2) : null,
      ),
      const ModulesTab(role: UserRole.admin),
      if (canReadStudents) const AdminStudentsScreen(),
      if (canReadStaff) const AdminStaffScreen(),
      const RoleProfileScreen(),
    ];

    // A permission lost mid-session (a role edited while signed in) shortens the
    // list; without this the IndexedStack would be asked for a tab that is gone.
    final index = _index.clamp(0, pages.length - 1);

    return Scaffold(
      drawer: RoleDrawer(
        name: name,
        roleLabel: auth.roleKeys.isEmpty ? 'Staff' : _roleLabel(auth.roleKeys.first),
        subtitle: 'School console',
        entries: [
          DrawerEntry(Icons.dashboard_rounded, 'Dashboard', AppColors.primary, () => _select(0)),
          DrawerEntry(Icons.apps_rounded, 'All modules', AppColors.teal, () => _select(1)),
          if (canReadStudents)
            DrawerEntry(Icons.school_rounded, 'Students', AppColors.primary, () => _select(2)),
          if (canReadStaff)
            DrawerEntry(Icons.badge_rounded, 'Staff', AppColors.teal,
                () => _select(canReadStudents ? 3 : 2)),
          if (auth.can('students.create'))
            DrawerEntry(Icons.person_add_alt_1_rounded, 'Admit student', AppColors.good,
                () => _push(const CreateStudentScreen())),
          if (auth.can('staff.create'))
            DrawerEntry(Icons.group_add_rounded, 'Add staff', AppColors.teal,
                () => _push(const CreateStaffScreen())),
          if (auth.can('notices.manage'))
            DrawerEntry(Icons.campaign_rounded, 'Post notice', AppColors.gold,
                () => _push(const PostNoticeScreen())),
          DrawerEntry(Icons.person_rounded, 'Profile', AppColors.muted,
              () => _select(pages.length - 1)),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: IndexedStack(index: index, children: pages),
      ),
      bottomNavigationBar: AppBottomBar(index: index, items: tabs, onTap: _select),
    );
  }

  /// A readable name for a backend role key, for the drawer's badge.
  static String _roleLabel(String key) => key
      .split('_')
      .map((part) => part.isEmpty ? part : part[0] + part.substring(1).toLowerCase())
      .join(' ');
}
