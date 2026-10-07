import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/sync/sync_service.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'notifications_screen.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});
  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  @override
  Widget build(BuildContext context) {
    final svc = ref.watch(syncProvider);
    final sync = svc.state;
    final student = ref.watch(studentProvider).value;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
      children: [
        const AppScreenHeader(title: 'Settings'),
        const SizedBox(height: 18),

        // Account
        AppCard(
          child: Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: AppColors.accentSoft,
                child: Text(_initials(student?.name ?? 'V'),
                    style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(student?.name ?? 'Vidyalaya',
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(student?.className ?? 'Parent account',
                        style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),

        // Sync
        const SectionLabel('Sync'),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text('Data sync',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 12),
                  PrimaryButton(
                    expand: false,
                    label: sync.phase == SyncPhase.syncing ? 'Syncing…' : 'Sync now',
                    icon: Icons.sync_rounded,
                    onPressed: sync.phase == SyncPhase.syncing
                        ? null
                        : () async {
                            await ref.read(syncProvider).sync(manual: true);
                            refreshData(ref);
                          },
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(_syncSubtitle(sync),
                  style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.35)),
              const SizedBox(height: 10),
              const Hairline(),
              ToggleRow(
                title: 'Auto-sync',
                subtitle: 'Sync in the background on Wi-Fi and when reopened',
                value: svc.autoSync,
                onChanged: (v) => svc.setAutoSync(v),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),

        // Privacy & security
        const SectionLabel('Privacy & security'),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
          child: Column(
            children: [
              RowTile(
                icon: Icons.notifications_active_outlined,
                title: 'Notification preferences',
                subtitle: 'Choose what you get alerted about',
                onTap: () => Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => const NotificationsScreen(pushed: true))),
              ),
              const Hairline(),
              RowTile(icon: Icons.download_rounded, title: 'Download my data', onTap: () => _downloadData(context)),
              const Hairline(),
              RowTile(icon: Icons.help_outline_rounded, title: 'Help & support', onTap: () => _helpSupport(context)),
            ],
          ),
        ),
        const SizedBox(height: 22),

        // Sign out
        AppCard(
          onTap: () async {
            await ref.read(authProvider).signOut();
          },
          child: const Row(
            children: [
              Icon(Icons.logout_rounded, color: AppColors.danger, size: 20),
              SizedBox(width: 12),
              Text('Sign out',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.danger)),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Center(
          child: Text('Vidyalaya · offline-first preview',
              style: TextStyle(fontSize: 12, color: AppColors.faint)),
        ),
      ],
    );
  }

  String _syncSubtitle(SyncState s) {
    final pending =
        s.pending > 0 ? '${s.pending} ${s.pending == 1 ? 'change' : 'changes'} waiting · ' : '';
    switch (s.phase) {
      case SyncPhase.synced:
        return '${pending}Last synced just now';
      case SyncPhase.offline:
        return '${pending}Offline — saved on this device';
      case SyncPhase.error:
        return '${pending}Last sync failed — will retry';
      case SyncPhase.syncing:
        return 'Syncing…';
      case SyncPhase.idle:
        return s.lastSyncedAt == null ? '${pending}Not synced yet' : '${pending}Idle';
    }
  }

  void _downloadData(BuildContext context) {
    final s = ref.read(studentProvider).value;
    final inv = ref.read(invoicesProvider).value ?? const [];
    final notices = ref.read(noticesProvider).value ?? const [];
    _infoSheet(
      context,
      icon: Icons.download_rounded,
      title: 'Download my data',
      body: s == null
          ? 'Your data is stored securely on this device.'
          : 'Everything stored on this device for ${s.name}:\n\n'
              '•  Profile & enrolment — ${s.className}\n'
              '•  ${inv.length} fee invoice(s)\n'
              '•  ${notices.length} school notice(s)\n'
              '•  Attendance, results, homework & courses\n\n'
              'Your data stays on this device until it syncs. A full PDF/CSV export '
              'and email copy arrive in the next release.',
    );
  }

  void _helpSupport(BuildContext context) {
    _infoSheet(
      context,
      icon: Icons.help_outline_rounded,
      title: 'Help & support',
      body: 'Need a hand?\n\n'
          '•  Email  support@vidyalaya.app\n'
          '•  Your school office — contact details are in the Notices tab\n'
          '•  Tip: pull down on any screen to refresh, or tap the sync pill\n\n'
          'Vidyalaya · preview build',
    );
  }

  void _infoSheet(BuildContext context,
      {required IconData icon, required String title, required String body}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        margin: const EdgeInsets.all(14),
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
            color: AppColors.surface, borderRadius: BorderRadius.circular(AppRadius.card)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                  color: AppColors.accentSoft, borderRadius: BorderRadius.circular(13)),
              child: Icon(icon, color: AppColors.primary),
            ),
            const SizedBox(height: 14),
            Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Text(body,
                style: const TextStyle(fontSize: 14, color: AppColors.muted, height: 1.5)),
            const SizedBox(height: 20),
            PrimaryButton(label: 'Got it', onPressed: () => Navigator.pop(context)),
          ],
        ),
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(' ');
    return (parts.first.isNotEmpty ? parts.first[0] : '') +
        (parts.length > 1 && parts.last.isNotEmpty ? parts.last[0] : '');
  }
}
