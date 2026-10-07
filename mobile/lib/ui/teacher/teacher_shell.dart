import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../modules/module_registry.dart';
import '../widgets/role_nav.dart';
import '../widgets/role_profile.dart';
import 'set_homework.dart';
import 'teacher_classes.dart';
import 'teacher_home.dart';

class TeacherShell extends ConsumerStatefulWidget {
  const TeacherShell({super.key});
  @override
  ConsumerState<TeacherShell> createState() => _TeacherShellState();
}

class _TeacherShellState extends ConsumerState<TeacherShell> {
  int _index = 0;

  static const _tabs = [
    NavItem(Icons.dashboard_rounded, Icons.dashboard_outlined, 'Home'),
    NavItem(Icons.apps_rounded, Icons.apps_outlined, 'Modules'),
    NavItem(Icons.groups_rounded, Icons.groups_outlined, 'Classes'),
    NavItem(Icons.person_rounded, Icons.person_outline_rounded, 'Profile'),
  ];

  void _select(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final name = ref.watch(authProvider).name ?? 'Teacher';
    return Scaffold(
      drawer: RoleDrawer(
        name: name,
        roleLabel: 'Teacher',
        subtitle: 'Class tools',
        entries: [
          DrawerEntry(Icons.dashboard_rounded, 'Dashboard', AppColors.primary, () => _select(0)),
          DrawerEntry(Icons.apps_rounded, 'All modules', AppColors.teal, () => _select(1)),
          DrawerEntry(Icons.groups_rounded, 'My classes', AppColors.teal, () => _select(2)),
          DrawerEntry(Icons.assignment_add, 'Set homework', AppColors.gold,
              () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SetHomeworkScreen()))),
          DrawerEntry(Icons.person_rounded, 'Profile', AppColors.muted, () => _select(3)),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: IndexedStack(
          index: _index,
          children: [
            TeacherHomeScreen(onGoToClasses: () => _select(2)),
            const ModulesTab(role: UserRole.teacher),
            const TeacherClassesScreen(),
            const RoleProfileScreen(),
          ],
        ),
      ),
      bottomNavigationBar: AppBottomBar(index: _index, items: _tabs, onTap: _select),
    );
  }
}
