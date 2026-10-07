import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

final _day = DateFormat('EEE, d MMM');

/// The school notices / alerts feed. Reads from the local DB so it works
/// offline. Used both as the "Alerts" bottom tab ([pushed] = false, hamburger
/// header) and as a pushed screen from the module grid ([pushed] = true, back
/// button). Tapping a notice marks it read and shows the full text.
class NoticesScreen extends ConsumerWidget {
  const NoticesScreen({super.key, this.pushed = false});
  final bool pushed;

  void _open(BuildContext context, WidgetRef ref, AppNotice n) {
    if (!n.read) {
      ref.read(dbProvider).markNoticeRead(n.id);
      refreshData(ref);
    }
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => Container(
        margin: const EdgeInsets.all(14),
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
            color: AppColors.surface, borderRadius: BorderRadius.circular(AppRadius.card)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_day.format(n.date).toUpperCase(), style: eyebrow(AppColors.primary)),
            const SizedBox(height: 8),
            Text(n.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Text(n.body, style: const TextStyle(fontSize: 14.5, color: AppColors.muted, height: 1.5)),
            const SizedBox(height: 20),
            PrimaryButton(label: 'Close', onPressed: () => Navigator.pop(context)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(noticesProvider);
    final list = async.value ?? const <AppNotice>[];
    final unread = list.where((n) => !n.read).length;

    final cards = <Widget>[
      if (async.isLoading && list.isEmpty)
        const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
      else if (list.isEmpty)
        const AppCard(child: Text('No notices yet.', style: TextStyle(color: AppColors.muted)))
      else
        for (final n in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AppCard(
              onTap: () => _open(context, ref, n),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 9,
                    height: 9,
                    margin: const EdgeInsets.only(top: 6, right: 12),
                    decoration: BoxDecoration(
                        color: n.read ? AppColors.faint : AppColors.primary, shape: BoxShape.circle),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(n.title,
                                  style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: n.read ? FontWeight.w600 : FontWeight.w800)),
                            ),
                            const SizedBox(width: 8),
                            Text(_day.format(n.date),
                                style: const TextStyle(fontSize: 11.5, color: AppColors.faint)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(n.body,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
    ];

    if (pushed) {
      return DetailScaffold(
        title: 'Notices',
        subtitle: list.isEmpty ? 'From your school' : '$unread unread · ${list.length} total',
        icon: Icons.campaign_rounded,
        onRefresh: () async {
          await ref.read(syncProvider).sync(manual: true);
          refreshData(ref);
        },
        children: cards,
      );
    }

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async {
        await ref.read(syncProvider).sync(manual: true);
        refreshData(ref);
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          const AppScreenHeader(title: 'Notices', eyebrowText: 'Alerts'),
          const SizedBox(height: 18),
          if (list.isNotEmpty) ...[
            Text('$unread unread · ${list.length} total', style: eyebrow(AppColors.muted)),
            const SizedBox(height: 10),
          ],
          ...cards,
        ],
      ),
    );
  }
}
