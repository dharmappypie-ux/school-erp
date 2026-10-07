import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';
import 'post_notice.dart';

/// Admin notices: post a notice, and publish / unpublish / pin / unpin each one.
class AdminNoticesScreen extends ConsumerWidget {
  const AdminNoticesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminNoticesProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = async.value?['canManage'] == true;

    return DetailScaffold(
      title: 'Notices',
      subtitle: 'Post and manage announcements',
      icon: Icons.campaign_rounded,
      onRefresh: () async => ref.invalidate(adminNoticesProvider),
      fab: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        onPressed: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const PostNoticeScreen())),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Post'),
      ),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.",
                style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Text('No notices yet. Tap + to post one.',
              style: TextStyle(color: AppColors.muted)))
        else
          for (final n in items) ...[
            _NoticeCard(n: n, canManage: canManage),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _NoticeCard extends ConsumerStatefulWidget {
  const _NoticeCard({required this.n, required this.canManage});
  final Map<String, dynamic> n;
  final bool canManage;
  @override
  ConsumerState<_NoticeCard> createState() => _NoticeCardState();
}

class _NoticeCardState extends ConsumerState<_NoticeCard> {
  bool _busy = false;

  Future<void> _act(String action) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/notices', {
      'noticeId': widget.n['id'], 'action': action,
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Done.' : 'Could not update.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminNoticesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.n;
    final published = n['published'] == true;
    final pinned = n['pinned'] == true;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(n['title']?.toString() ?? '',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
            if (pinned) const Icon(Icons.push_pin_rounded, size: 16, color: AppColors.gold),
          ]),
          const SizedBox(height: 2),
          Row(children: [
            StatusChip(
              label: published ? 'Published' : 'Draft',
              color: published ? AppColors.good : AppColors.muted,
              bg: published ? AppColors.goodSoft : AppColors.line,
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(n['audience']?.toString() ?? '',
                style: const TextStyle(fontSize: 12, color: AppColors.muted), overflow: TextOverflow.ellipsis)),
          ]),
          if (widget.canManage) ...[
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              _Chip(published ? 'Unpublish' : 'Publish', _busy ? null : () => _act(published ? 'UNPUBLISH' : 'PUBLISH')),
              _Chip(pinned ? 'Unpin' : 'Pin', _busy ? null : () => _act(pinned ? 'UNPIN' : 'PIN')),
            ]),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, this.onTap);
  final String label;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          decoration: BoxDecoration(
            color: AppColors.accentSoft,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: Text(label,
              style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 13)),
        ),
      );
}
