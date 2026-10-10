import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

({Color c, Color bg, String label}) _statusStyle(String s) => switch (s) {
      'APPROVED' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Approved'),
      'REJECTED' => (c: AppColors.danger, bg: AppColors.dangerSoft, label: 'Rejected'),
      'CANCELLED' => (c: AppColors.muted, bg: AppColors.line, label: 'Withdrawn'),
      _ => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Pending'),
    };

/// Student leave for staff: requests raised by families from the parent app or
/// the portal, pending first, with Approve / Reject.
class AdminStudentLeaveScreen extends ConsumerWidget {
  const AdminStudentLeaveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(studentLeaveProvider);
    final items =
        (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final offline = !async.isLoading && async.value == null;
    final pending = items.where((r) => r['status'] == 'PENDING').length;

    return DetailScaffold(
      title: 'Student leave',
      subtitle: offline ? 'Not loaded' : '$pending pending · ${items.length} total',
      icon: Icons.event_busy_rounded,
      onRefresh: () async => ref.invalidate(studentLeaveProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(
              child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn),
            SizedBox(width: 12),
            Expanded(
                child: Text("Couldn't reach the school — pull down to retry.",
                    style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(
              child: Row(children: [
            Icon(Icons.inbox_rounded, color: AppColors.faint),
            SizedBox(width: 12),
            Expanded(
                child: Text('No student leave requests.',
                    style: TextStyle(color: AppColors.muted))),
          ]))
        else
          for (final r in items) ...[
            _StudentLeaveCard(r: r),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _StudentLeaveCard extends ConsumerStatefulWidget {
  const _StudentLeaveCard({required this.r});
  final Map<String, dynamic> r;
  @override
  ConsumerState<_StudentLeaveCard> createState() => _StudentLeaveCardState();
}

class _StudentLeaveCardState extends ConsumerState<_StudentLeaveCard> {
  bool _busy = false;
  bool _rejecting = false;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _decide(String decision) async {
    // The server requires a reason on a rejection; asking for it here means the
    // teacher is not bounced by an error after tapping.
    if (decision == 'REJECTED' && _note.text.trim().isEmpty) {
      setState(() => _rejecting = true);
      return;
    }
    setState(() => _busy = true);
    final res = await ref
        .read(apiProvider)
        .postJson('/api/mobile/v1/admin/student-leave/decide', {
      'requestId': widget.r['id'],
      'decision': decision,
      if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
    });
    if (!mounted) return;
    setState(() {
      _busy = false;
      _rejecting = false;
    });
    final msg = res.body?['message'] ??
        res.body?['error'] ??
        (res.ok ? 'Done.' : 'Could not update.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(studentLeaveProvider);
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.r;
    final status = (r['status'] as String?) ?? 'PENDING';
    final st = _statusStyle(status);
    final isPending = status == 'PENDING';
    final portion = (r['portion'] as String?) ?? 'FULL_DAY';
    final period = r['leavingAfterPeriod'];
    final className = (r['className']?.toString() ?? '');

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
                    Text(r['studentName']?.toString() ?? '',
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(
                        [
                          if (className.isNotEmpty) className,
                          r['admissionNo']?.toString() ?? '',
                        ].where((v) => v.isNotEmpty).join(' · '),
                        style: const TextStyle(
                            fontSize: 12.5, color: AppColors.muted)),
                  ],
                ),
              ),
              StatusChip(label: st.label, color: st.c, bg: st.bg),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text(r['span']?.toString() ?? '',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(width: 8),
              Text('${r['days'] ?? ''} day(s)',
                  style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
            ],
          ),
          if (portion != 'FULL_DAY' || period != null) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              children: [
                if (portion != 'FULL_DAY')
                  StatusChip(
                      label: r['portionLabel']?.toString() ?? 'Half day',
                      color: AppColors.teal,
                      bg: AppColors.tealSoft),
                if (period != null)
                  StatusChip(
                      label: 'leaves after period $period',
                      color: AppColors.muted,
                      bg: AppColors.line),
              ],
            ),
          ],
          if ((r['reason']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(r['reason'].toString(),
                style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          ],
          if ((r['askedBy']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('asked by ${r['askedBy']}',
                style: const TextStyle(fontSize: 11.5, color: AppColors.faint)),
          ],
          if ((r['decisionNote']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Note: ${r['decisionNote']}',
                style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
          ],
          if (isPending) ...[
            if (_rejecting) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _note,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Why is this being rejected?',
                  isDense: true,
                ),
                onSubmitted: (_) => _decide('REJECTED'),
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _Btn(
                    label: _rejecting ? 'Cancel' : 'Approve',
                    color: _rejecting ? AppColors.muted : AppColors.good,
                    filled: !_rejecting,
                    busy: _busy,
                    onTap: _busy
                        ? null
                        : () => _rejecting
                            ? setState(() => _rejecting = false)
                            : _decide('APPROVED'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Btn(
                    label: _rejecting ? 'Confirm rejection' : 'Reject',
                    color: AppColors.danger,
                    filled: _rejecting,
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
  const _Btn(
      {required this.label,
      required this.color,
      required this.filled,
      required this.busy,
      this.onTap});
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
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(label,
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13.5,
                    color: filled ? Colors.white : color)),
      ),
    );
  }
}
