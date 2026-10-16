import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/role_nav.dart';
import '../widgets/role_profile.dart';
import 'platform_schools.dart';
import 'new_school.dart';

/// The platform owner's shell.
///
/// A platform owner is not staff of any school: they provision tenants and set
/// their plans, and the internal data of a school — its students, fees, marks —
/// is deliberately not reachable from here. So this shell has no module grid,
/// only the cross-tenant console, matching what the web's PLATFORM_NAV shows.
class PlatformShell extends ConsumerStatefulWidget {
  const PlatformShell({super.key});
  @override
  ConsumerState<PlatformShell> createState() => _PlatformShellState();
}

class _PlatformShellState extends ConsumerState<PlatformShell> {
  int _index = 0;

  static const _tabs = [
    NavItem(Icons.apartment_rounded, Icons.apartment_outlined, 'Schools'),
    NavItem(Icons.person_rounded, Icons.person_outline_rounded, 'Profile'),
  ];

  void _select(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final name = ref.watch(authProvider).name ?? 'Platform owner';
    return Scaffold(
      drawer: RoleDrawer(
        name: name,
        roleLabel: 'Platform owner',
        subtitle: 'All schools',
        entries: [
          DrawerEntry(Icons.apartment_rounded, 'Schools', AppColors.primary, () => _select(0)),
          DrawerEntry(Icons.add_business_rounded, 'Add a school', AppColors.good,
              () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const NewSchoolScreen()))),
          DrawerEntry(Icons.person_rounded, 'Profile', AppColors.muted, () => _select(1)),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: IndexedStack(
          index: _index,
          children: const [
            PlatformSchoolsTab(),
            RoleProfileScreen(),
          ],
        ),
      ),
      bottomNavigationBar: AppBottomBar(index: _index, items: _tabs, onTap: _select),
    );
  }
}
