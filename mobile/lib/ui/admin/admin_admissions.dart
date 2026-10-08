import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';
import 'admin_admission_detail.dart';

Color _statusColor(String s) => switch (s) {
      'ENROLLED' || 'ACCEPTED' || 'OFFERED' => AppColors.good,
      'REJECTED' || 'WITHDRAWN' => AppColors.danger,
      'DRAFT' => AppColors.muted,
      _ => AppColors.primary,
    };

/// Admissions pipeline: each application with its current stage and the stages
/// it can move to next.
class AdminAdmissionsScreen extends ConsumerWidget {
  const AdminAdmissionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminAdmissionsProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = async.value?['canManage'] == true;

    return DetailScaffold(
      title: 'Admissions',
      subtitle: '${items.length} applications',
      icon: Icons.how_to_reg_rounded,
      onRefresh: () async => ref.invalidate(adminAdmissionsProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Text('No applications.', style: TextStyle(color: AppColors.muted)))
        else
          for (final a in items) ...[
            _AppCard(a: a, canManage: canManage),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _AppCard extends ConsumerStatefulWidget {
  const _AppCard({required this.a, required this.canManage});
  final Map<String, dynamic> a;
  final bool canManage;
  @override
  ConsumerState<_AppCard> createState() => _AppCardState();
}

class _AppCardState extends ConsumerState<_AppCard> {
  bool _busy = false;

  Future<void> _move(String toStatus) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/admissions/move', {
      'applicationId': widget.a['id'], 'toStatus': toStatus,
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Moved.' : 'Could not move.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminAdmissionsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    final stages = (a['nextStages'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    return AppCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => AdminAdmissionDetailScreen(applicationId: a['id'].toString()))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(a['name']?.toString() ?? '', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
          StatusChip(
            label: a['statusLabel']?.toString() ?? '',
            color: _statusColor(a['status'] as String? ?? ''),
            bg: _statusColor(a['status'] as String? ?? '').withValues(alpha: 0.12),
          ),
        ]),
        const SizedBox(height: 4),
        Text('${a['applicationNo'] ?? ''} · ${a['className'] ?? ''} · ${a['guardian'] ?? ''}',
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
        if (widget.canManage && stages.isNotEmpty) ...[
          const SizedBox(height: 12),
          const Text('MOVE TO', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: AppColors.faint, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final s in stages)
              GestureDetector(
                onTap: _busy ? null : () => _move(s['key'] as String),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(color: AppColors.accentSoft, borderRadius: BorderRadius.circular(AppRadius.pill)),
                  child: Text(s['label']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 12.5)),
                ),
              ),
          ]),
        ],
      ]),
    );
  }
}
