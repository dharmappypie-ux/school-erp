import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/sync/sync_service.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import 'widgets.dart';

/// Live sync status. Tap to sync now (manual). Shows pending-change count when
/// there are unsynced local edits.
class SyncPill extends ConsumerWidget {
  const SyncPill({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sync = ref.watch(syncProvider);
    final s = sync.state;

    late String label;
    late Color color;
    late Color bg;
    IconData? icon;
    bool busy = false;

    switch (s.phase) {
      case SyncPhase.syncing:
        label = 'Syncing…';
        color = AppColors.accent;
        bg = AppColors.accentSoft;
        busy = true;
        break;
      case SyncPhase.synced:
        label = 'Synced ${_ago(s.lastSyncedAt)}';
        color = AppColors.good;
        bg = AppColors.goodSoft;
        icon = Icons.check_rounded;
        break;
      case SyncPhase.offline:
        label = 'Offline · saved here';
        color = AppColors.warn;
        bg = AppColors.warnSoft;
        icon = Icons.cloud_off_rounded;
        break;
      case SyncPhase.error:
        label = 'Sync failed';
        color = AppColors.danger;
        bg = AppColors.dangerSoft;
        icon = Icons.error_outline_rounded;
        break;
      case SyncPhase.idle:
        label = s.lastSyncedAt == null ? 'Tap to sync' : 'Synced ${_ago(s.lastSyncedAt)}';
        color = AppColors.muted;
        bg = AppColors.surfaceSunken;
        icon = Icons.sync_rounded;
        break;
    }
    if (s.pending > 0 && s.phase != SyncPhase.syncing) {
      label = '${s.pending} to sync';
      color = AppColors.warn;
      bg = AppColors.warnSoft;
      icon = Icons.sync_problem_rounded;
    }

    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.pill),
      onTap: busy
          ? null
          : () async {
              await ref.read(syncProvider).sync(manual: true);
              refreshData(ref);
            },
      child: StatusChip(label: label, color: color, bg: bg, busy: busy, icon: icon),
    );
  }

  static String _ago(DateTime? t) {
    if (t == null) return 'just now';
    final d = DateTime.now().difference(t);
    if (d.inSeconds < 45) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes}m ago';
    if (d.inHours < 24) return '${d.inHours}h ago';
    return '${d.inDays}d ago';
  }
}
