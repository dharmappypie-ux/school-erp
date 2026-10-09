import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _apiDate = DateFormat('yyyy-MM-dd');
final _showDate = DateFormat('d MMM');

({Color c, Color bg, String label}) _statusStyle(String s) => switch (s) {
      'APPROVED' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Approved'),
      'REJECTED' => (c: AppColors.danger, bg: AppColors.dangerSoft, label: 'Rejected'),
      'CANCELLED' => (c: AppColors.muted, bg: AppColors.line, label: 'Withdrawn'),
      _ => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Pending'),
    };

const _portions = [
  ('FULL_DAY', 'Full day'),
  ('FIRST_HALF', 'First half — leaves at recess'),
  ('SECOND_HALF', 'Second half — arrives after recess'),
];

/// The family's own leave: ask for time off, and see what the school said.
class MyLeaveScreen extends ConsumerWidget {
  const MyLeaveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myLeaveProvider);
    final items =
        (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final offline = !async.isLoading && async.value == null;
    final pending = items.where((r) => r['status'] == 'PENDING').length;

    return DetailScaffold(
      title: 'Leave',
      subtitle: offline
          ? 'Not loaded'
          : pending > 0
              ? '$pending awaiting a decision'
              : 'Ask for time away from school',
      icon: Icons.event_busy_rounded,
      onRefresh: () async => ref.invalidate(myLeaveProvider),
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Request leave',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              const Text('The class teacher sees this straight away.',
                  style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
              const SizedBox(height: 14),
              const _ApplyForm(),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (async.isLoading)
          const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
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
                child: Text('No leave requested yet.',
                    style: TextStyle(color: AppColors.muted))),
          ]))
        else
          for (final r in items) ...[
            _RequestCard(r: r),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _ApplyForm extends ConsumerStatefulWidget {
  const _ApplyForm();
  @override
  ConsumerState<_ApplyForm> createState() => _ApplyFormState();
}

class _ApplyFormState extends ConsumerState<_ApplyForm> {
  DateTime? _from;
  DateTime? _to;
  String _portion = 'FULL_DAY';
  final _reason = TextEditingController();
  final _period = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    _period.dispose();
    super.dispose();
  }

  /// A half day only means something on a single date — the server rejects the
  /// combination, so the option is not offered across a span either.
  bool get _singleDay =>
      _from != null && _to != null && _apiDate.format(_from!) == _apiDate.format(_to!);

  Future<void> _pick(bool isFrom) async {
    final now = DateTime.now();
    final initial = isFrom ? (_from ?? now) : (_to ?? _from ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: now.subtract(const Duration(days: 60)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) {
        _from = picked;
        // Most requests are a single day; filling the end saves a tap and makes
        // the half-day choice appear straight away.
        if (_to == null || _to!.isBefore(picked)) _to = picked;
      } else {
        _to = picked;
      }
      if (!_singleDay) _portion = 'FULL_DAY';
    });
  }

  Future<void> _submit() async {
    if (_from == null || _to == null) {
      showToast(context, 'Choose the dates first.', error: true);
      return;
    }
    if (_reason.text.trim().isEmpty) {
      showToast(context, 'Say why — the class teacher needs a reason.', error: true);
      return;
    }
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/parent/leave', {
      'fromDate': _apiDate.format(_from!),
      'toDate': _apiDate.format(_to!),
      'portion': _portion,
      'reason': _reason.text.trim(),
      if (_portion == 'FIRST_HALF' && _period.text.trim().isNotEmpty)
        'leavingAfterPeriod': _period.text.trim(),
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ??
        res.body?['error'] ??
        (res.ok ? 'Request sent.' : 'Could not send the request.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      setState(() {
        _from = null;
        _to = null;
        _portion = 'FULL_DAY';
        _reason.clear();
        _period.clear();
      });
      ref.invalidate(myLeaveProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
                child: _DateField(
                    label: 'First day',
                    value: _from,
                    onTap: () => _pick(true))),
            const SizedBox(width: 10),
            Expanded(
                child: _DateField(
                    label: 'Last day', value: _to, onTap: () => _pick(false))),
          ],
        ),
        if (_singleDay) ...[
          const SizedBox(height: 12),
          const Text('How much of the day?',
              style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (code, label) in _portions)
                GestureDetector(
                  onTap: () => setState(() => _portion = code),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: _portion == code
                          ? AppColors.primary
                          : AppColors.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                    child: Text(label,
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: _portion == code
                                ? Colors.white
                                : AppColors.primary)),
                  ),
                ),
            ],
          ),
        ],
        if (_singleDay && _portion == 'FIRST_HALF') ...[
          const SizedBox(height: 12),
          TextField(
            controller: _period,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Leaving after which period?',
              hintText: 'e.g. 2 — optional',
              isDense: true,
            ),
          ),
        ],
        const SizedBox(height: 12),
        TextField(
          controller: _reason,
          minLines: 2,
          maxLines: 4,
          maxLength: 500,
          decoration: const InputDecoration(
            labelText: 'Reason',
            hintText: 'Medical appointment, family function, travel…',
            isDense: true,
          ),
        ),
        const SizedBox(height: 4),
        SizedBox(
          width: double.infinity,
          child: GestureDetector(
            onTap: _busy ? null : _submit,
            child: Container(
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Send request',
                      style: TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w800)),
            ),
          ),
        ),
      ],
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
          color: AppColors.surfaceSunken,
          borderRadius: BorderRadius.circular(AppRadius.chip),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(fontSize: 11, color: AppColors.muted)),
            const SizedBox(height: 2),
            Text(value == null ? 'Choose' : _showDate.format(value!),
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: value == null ? AppColors.faint : AppColors.ink)),
          ],
        ),
      ),
    );
  }
}

class _RequestCard extends ConsumerStatefulWidget {
  const _RequestCard({required this.r});
  final Map<String, dynamic> r;
  @override
  ConsumerState<_RequestCard> createState() => _RequestCardState();
}

class _RequestCardState extends ConsumerState<_RequestCard> {
  bool _busy = false;

  Future<void> _withdraw() async {
    setState(() => _busy = true);
    final res = await ref
        .read(apiProvider)
        .postJson('/api/mobile/v1/parent/leave/cancel', {
      'requestId': widget.r['id'],
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ??
        res.body?['error'] ??
        (res.ok ? 'Withdrawn.' : 'Could not withdraw.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(myLeaveProvider);
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.r;
    final st = _statusStyle((r['status'] as String?) ?? 'PENDING');
    final portion = (r['portion'] as String?) ?? 'FULL_DAY';
    final period = r['leavingAfterPeriod'];

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(r['span']?.toString() ?? '',
                    style:
                        const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
              StatusChip(label: st.label, color: st.c, bg: st.bg),
            ],
          ),
          const SizedBox(height: 4),
          Text(
              [
                '${r['days'] ?? ''} day(s)',
                if (portion != 'FULL_DAY') r['portionLabel']?.toString() ?? '',
                if (period != null) 'leaves after period $period',
              ].where((v) => v.isNotEmpty).join(' · '),
              style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          if ((r['reason']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(r['reason'].toString(), style: const TextStyle(fontSize: 13)),
          ],
          if ((r['decisionNote']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('School said: ${r['decisionNote']}',
                style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ],
          if (r['canWithdraw'] == true) ...[
            const SizedBox(height: 12),
            GestureDetector(
              onTap: _busy ? null : _withdraw,
              child: Container(
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.muted.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  border: Border.all(color: AppColors.muted.withValues(alpha: 0.4)),
                ),
                child: _busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Withdraw',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: AppColors.muted)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
