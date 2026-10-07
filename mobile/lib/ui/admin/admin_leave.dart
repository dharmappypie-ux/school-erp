import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

({Color c, Color bg, String label}) _statusStyle(String s) => switch (s) {
      'APPROVED' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Approved'),
      'REJECTED' => (c: AppColors.danger, bg: AppColors.dangerSoft, label: 'Rejected'),
      'CANCELLED' => (c: AppColors.muted, bg: AppColors.line, label: 'Cancelled'),
      _ => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Pending'),
    };

/// Admin leave: staff requests (pending first) with Approve / Reject, mirroring
/// the website's leave desk.
class AdminLeaveScreen extends ConsumerWidget {
  const AdminLeaveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminLeaveProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canDecide = async.value?['canDecide'] == true;
    final offline = !async.isLoading && async.value == null;
    final pending = items.where((r) => r['status'] == 'PENDING').length;

    return DetailScaffold(
      title: 'Leave requests',
      subtitle: offline ? 'Not loaded' : '$pending pending · ${items.length} total',
      icon: Icons.event_busy_rounded,
      onRefresh: () async => ref.invalidate(adminLeaveProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn),
            SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.",
                style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Row(children: [
            Icon(Icons.inbox_rounded, color: AppColors.faint),
            SizedBox(width: 12),
            Expanded(child: Text('No leave requests.', style: TextStyle(color: AppColors.muted))),
          ]))
        else
          for (final r in items) ...[
            _LeaveCard(r: r, canDecide: canDecide),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _LeaveCard extends ConsumerStatefulWidget {
  const _LeaveCard({required this.r, required this.canDecide});
  final Map<String, dynamic> r;
  final bool canDecide;
  @override
  ConsumerState<_LeaveCard> createState() => _LeaveCardState();
}

class _LeaveCardState extends ConsumerState<_LeaveCard> {
  bool _busy = false;

  Future<void> _decide(String decision) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/leave/decide', {
      'requestId': widget.r['id'],
      'decision': decision,
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Done.' : 'Could not update.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminLeaveProvider);
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.r;
    final status = (r['status'] as String?) ?? 'PENDING';
    final st = _statusStyle(status);
    final isPending = status == 'PENDING';
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r['staffName']?.toString() ?? '',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text('${r['type'] ?? ''} · ${r['days'] ?? ''} day(s)',
                        style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                  ],
                ),
              ),
              StatusChip(label: st.label, color: st.c, bg: st.bg),
            ],
          ),
          const SizedBox(height: 8),
          Text(r['dates']?.toString() ?? '', style: const TextStyle(fontSize: 13)),
          if ((r['reason']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(r['reason'].toString(), style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          ],
          if (isPending && widget.canDecide) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _Btn(
                    label: 'Approve',
                    color: AppColors.good,
                    filled: true,
                    busy: _busy,
                    onTap: _busy ? null : () => _decide('APPROVED'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Btn(
                    label: 'Reject',
                    color: AppColors.danger,
                    filled: false,
                    busy: _busy,
                    onTap: _busy ? null : () => _decide('REJECTED'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Btn extends StatelessWidget {
  const _Btn({required this.label, required this.color, required this.filled, required this.busy, this.onTap});
  final String label;
  final Color color;
  final bool filled;
  final bool busy;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled ? color : color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: filled ? null : Border.all(color: color.withValues(alpha: 0.5)),
        ),
        child: busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(label,
                style: TextStyle(
                    fontWeight: FontWeight.w800, color: filled ? Colors.white : color)),
      ),
    );
  }
}
