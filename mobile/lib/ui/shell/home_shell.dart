import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../../data/sync/sync_service.dart';
import '../../state/providers.dart';
import '../modules/module_registry.dart';
import '../screens/fees_screen.dart';
import '../screens/home_screen.dart';
import '../screens/notices_screen.dart';
import '../screens/settings_screen.dart';
import '../widgets/role_nav.dart';
import 'app_drawer.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});
  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> with WidgetsBindingObserver {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Keep local reads fresh whenever a sync lands, and start the sync engine
    // (connectivity listener + periodic timer + an initial pull).
    final sync = ref.read(syncProvider);
    sync.addListener(_onSync);
    sync.start();
  }

  void _onSync() {
    if (ref.read(syncProvider).state.phase == SyncPhase.synced && mounted) {
      refreshData(ref);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(syncProvider).onResumed();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ref.read(syncProvider).removeListener(_onSync);
    super.dispose();
  }

  static const _tabs = [
    NavItem(Icons.home_rounded, Icons.home_outlined, 'Home'),
    NavItem(Icons.apps_rounded, Icons.apps_outlined, 'Modules'),
    NavItem(Icons.account_balance_wallet_rounded, Icons.account_balance_wallet_outlined, 'Fees'),
    NavItem(Icons.notifications_rounded, Icons.notifications_none_rounded, 'Alerts'),
    NavItem(Icons.settings_rounded, Icons.settings_outlined, 'Settings'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: AppDrawer(
        currentIndex: _index,
        onSelectTab: (i) => setState(() => _index = i),
      ),
      body: SafeArea(
        bottom: false,
        child: IndexedStack(
          index: _index,
          children: [
            HomeScreen(onOpenTab: (i) => setState(() => _index = i)),
            const ModulesTab(role: UserRole.parent),
            const FeesScreen(),
            const NoticesScreen(),
            const SettingsScreen(),
          ],
        ),
      ),
      bottomNavigationBar: AppBottomBar(
        index: _index,
        items: _tabs,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}
