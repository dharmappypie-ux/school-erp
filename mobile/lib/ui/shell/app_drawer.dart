import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/sync/sync_service.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../screens/attendance_screen.dart';
import '../screens/courses_screen.dart';
import '../screens/homework_screen.dart';
import '../screens/results_screen.dart';

/// The side navigation drawer — a navy profile header (with a Sync & sign-out
/// control) curving into the plum menu list, in the spirit of the reference.
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key, required this.currentIndex, required this.onSelectTab});
  final int currentIndex;
  final ValueChanged<int> onSelectTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final student = ref.watch(studentProvider).value;
    final sync = ref.watch(syncProvider).state;

    return Drawer(
      backgroundColor: AppColors.bg,
      width: 300,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Header(
            name: student?.name ?? 'Vidyalaya',
            subtitle: student?.className ?? 'Parent account',
            sync: sync,
            onSync: () => ref.read(syncProvider).sync(manual: true),
            onSignOut: () => _confirmSignOut(context, ref),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              children: [
                _tab(context, Icons.dashboard_rounded, 'Dashboard', 0, AppColors.primary),
                _tab(context, Icons.apps_rounded, 'All modules', 1, AppColors.teal),
                _push(context, Icons.fact_check_rounded, 'Attendance', AppColors.teal,
                    const AttendanceScreen()),
                _push(context, Icons.insights_rounded, 'Results', AppColors.primary,
                    const ResultsScreen()),
                _push(context, Icons.menu_book_rounded, 'Homework', AppColors.gold,
                    const HomeworkScreen()),
                _push(context, Icons.play_lesson_rounded, 'Courses & quizzes', AppColors.good,
                    const CoursesScreen()),
                const _DrawerDivider(),
                _tab(context, Icons.account_balance_wallet_rounded, 'Fees', 2, AppColors.teal),
                _tab(context, Icons.notifications_rounded, 'Notifications', 3, AppColors.gold),
                _tab(context, Icons.settings_rounded, 'Settings', 4, AppColors.muted),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => _confirmSignOut(context, ref),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppColors.dangerSoft,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: const [
                      Icon(Icons.power_settings_new_rounded, color: AppColors.danger, size: 20),
                      SizedBox(width: 12),
                      Text('Sign out',
                          style: TextStyle(
                              color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 14.5)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tab(BuildContext context, IconData icon, String label, int index, Color color) {
    final selected = index == currentIndex;
    return _DrawerItem(
      icon: icon,
      label: label,
      color: color,
      selected: selected,
      onTap: () {
        Navigator.pop(context);
        onSelectTab(index);
      },
    );
  }

  Widget _push(BuildContext context, IconData icon, String label, Color color, Widget screen) {
    return _DrawerItem(
      icon: icon,
      label: label,
      color: color,
      selected: false,
      onTap: () {
        Navigator.pop(context);
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
      },
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Sign out?'),
        content: const Text('Your data stays saved on this device and will sync next time you sign in.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(authProvider).signOut();
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.name,
    required this.subtitle,
    required this.sync,
    required this.onSync,
    required this.onSignOut,
  });
  final String name;
  final String subtitle;
  final SyncState sync;
  final VoidCallback onSync;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: kNavyGradient,
        borderRadius: BorderRadius.only(bottomRight: Radius.circular(44)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 22, 18, 26),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: kHeroGradient,
                      border: Border.all(color: Colors.white.withValues(alpha: 0.25), width: 2),
                    ),
                    child: Center(
                      child: Text(_initials(name),
                          style: const TextStyle(
                              color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20)),
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: onSignOut,
                    icon: const Icon(Icons.power_settings_new_rounded, color: Colors.white),
                    style: IconButton.styleFrom(
                      backgroundColor: Colors.white.withValues(alpha: 0.12),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(name,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(subtitle,
                  style: const TextStyle(color: AppColors.onDarkMuted, fontSize: 13)),
              const SizedBox(height: 16),
              InkWell(
                borderRadius: BorderRadius.circular(AppRadius.pill),
                onTap: sync.phase == SyncPhase.syncing ? null : onSync,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (sync.phase == SyncPhase.syncing)
                        const SizedBox(
                            width: 13,
                            height: 13,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      else
                        const Icon(Icons.sync_rounded, size: 15, color: Colors.white),
                      const SizedBox(width: 8),
                      Text(_syncLabel(sync),
                          style: const TextStyle(
                              color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _syncLabel(SyncState s) {
    switch (s.phase) {
      case SyncPhase.syncing:
        return 'Syncing…';
      case SyncPhase.offline:
        return 'Offline · tap to retry';
      case SyncPhase.error:
        return 'Sync failed · tap to retry';
      default:
        return s.lastSyncedAt == null ? 'Tap to sync' : 'Synced · tap to refresh';
    }
  }

  static String _initials(String name) {
    final parts = name.trim().split(' ');
    return (parts.first.isNotEmpty ? parts.first[0] : '') +
        (parts.length > 1 && parts.last.isNotEmpty ? parts.last[0] : '');
  }
}

class _DrawerItem extends StatelessWidget {
  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.color,
    required this.selected,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            color: selected ? AppColors.accentSoft : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: selected ? 0.18 : 0.12),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(icon, size: 19, color: color),
              ),
              const SizedBox(width: 14),
              Text(label,
                  style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                      color: selected ? AppColors.primary : AppColors.ink)),
              const Spacer(),
              if (selected)
                const Icon(Icons.circle, size: 7, color: AppColors.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _DrawerDivider extends StatelessWidget {
  const _DrawerDivider();
  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Divider(height: 1, color: AppColors.line),
      );
}
