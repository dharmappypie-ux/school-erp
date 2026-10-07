import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/sync_pill.dart';
import '../widgets/widgets.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key, this.pushed = false});

  /// When pushed (e.g. from Settings) show a back button instead of the
  /// drawer hamburger header.
  final bool pushed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    final content = prefs.when(
      loading: () => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
      error: (e, _) => AppCard(child: Text('$e')),
      data: (list) => _body(context, ref, list),
    );

    Future<void> refresh() async {
      await ref.read(syncProvider).sync(manual: true);
      refreshData(ref);
    }

    if (pushed) {
      return DetailScaffold(
        title: 'Notifications',
        subtitle: 'Choose what you get alerted about',
        icon: Icons.notifications_active_rounded,
        onRefresh: refresh,
        children: [content],
      );
    }

    return RefreshIndicator(
      color: AppColors.ink,
      onRefresh: refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          const AppScreenHeader(title: 'Notifications', trailing: SyncPill()),
          const SizedBox(height: 18),
          content,
        ],
      ),
    );
  }

  Widget _body(BuildContext context, WidgetRef ref, List<Pref> list) {
    final on = list.where((p) => p.enabled).length;
    final groups = <String, List<Pref>>{};
    for (final p in list) {
      groups.putIfAbsent(p.group, () => []).add(p);
    }

    Future<void> toggle(Pref p, bool v) async {
      await ref.read(dbProvider).setPref(p.key, v);
      refreshData(ref);
      await ref.read(syncProvider).refreshPending(); // reflect the queued change
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DarkCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('ENABLED', style: eyebrow(AppColors.onDarkMuted)),
                    const SizedBox(height: 6),
                    Text.rich(TextSpan(children: [
                      TextSpan(
                          text: '$on',
                          style: const TextStyle(
                              color: AppColors.onDark, fontSize: 40, fontWeight: FontWeight.w800)),
                      TextSpan(
                          text: '  of ${list.length}',
                          style: const TextStyle(
                              color: AppColors.onDarkMuted, fontSize: 18, fontWeight: FontWeight.w600)),
                    ])),
                  ],
                ),
              ),
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(16)),
                child: const Icon(Icons.notifications_active_rounded, color: AppColors.onDark),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        for (final entry in groups.entries) ...[
          SectionLabel(entry.key),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
            child: Column(
              children: [
                for (var i = 0; i < entry.value.length; i++) ...[
                  ToggleRow(
                    title: entry.value[i].label,
                    subtitle: entry.value[i].subtitle,
                    value: entry.value[i].enabled,
                    onChanged: (v) => toggle(entry.value[i], v),
                  ),
                  if (i < entry.value.length - 1) const Hairline(),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
        ],
        const SizedBox(height: 2),
        Center(
          child: Text('Changes are saved on your device and synced when online.',
              style: TextStyle(fontSize: 12, color: AppColors.muted)),
        ),
      ],
    );
  }
}
