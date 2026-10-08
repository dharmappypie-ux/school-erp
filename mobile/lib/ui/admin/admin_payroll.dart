import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// Payroll: recent payslips, each markable as paid.
class AdminPayrollScreen extends ConsumerWidget {
  const AdminPayrollScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminPayrollProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = async.value?['canManage'] == true;
    final unpaid = items.where((p) => p['status'] != 'PAID').length;

    return DetailScaffold(
      title: 'Payroll',
      subtitle: '$unpaid unpaid · ${items.length} payslips',
      icon: Icons.account_balance_rounded,
      onRefresh: () async => ref.invalidate(adminPayrollProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else ...[
          if (canManage) ...[
            const _RunPanel(),
            const SizedBox(height: 16),
            const SectionLabel('Payslips'),
          ],
          if (items.isEmpty)
            const AppCard(child: Text('No payslips yet. Use Run payroll above to generate them for a month.', style: TextStyle(color: AppColors.muted)))
          else
            for (final p in items) ...[
              _SlipRow(p: p, canManage: canManage),
              const SizedBox(height: 10),
            ],
        ],
      ],
    );
  }
}

const _monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/// Generate DRAFT payslips for a chosen month/year.
class _RunPanel extends ConsumerStatefulWidget {
  const _RunPanel();
  @override
  ConsumerState<_RunPanel> createState() => _RunPanelState();
}

class _RunPanelState extends ConsumerState<_RunPanel> {
  late int _month = DateTime.now().month;
  late int _year = DateTime.now().year;
  bool _busy = false;

  Future<void> _run() async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/payroll/run', {
      'month': _month, 'year': _year,
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Payroll run.' : 'Could not run payroll.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminPayrollProvider);
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final years = [for (int y = now.year - 2; y <= now.year + 1; y++) y];
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Run payroll', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          const Text('Generates draft payslips for active staff with a salary structure.',
              style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                flex: 3,
                child: AppDropdown<int>(
                  label: 'Month',
                  value: _month,
                  items: [for (int m = 1; m <= 12; m++) m],
                  itemLabel: (m) => _monthNames[m],
                  onChanged: (m) => setState(() => _month = m ?? _month),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: AppDropdown<int>(
                  label: 'Year',
                  value: _year,
                  items: years,
                  itemLabel: (y) => '$y',
                  onChanged: (y) => setState(() => _year = y ?? _year),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: _busy ? 'Running…' : 'Run payroll',
            icon: Icons.play_circle_fill_rounded,
            onPressed: _busy ? null : _run,
          ),
        ],
      ),
    );
  }
}

class _SlipRow extends ConsumerStatefulWidget {
  const _SlipRow({required this.p, required this.canManage});
  final Map<String, dynamic> p;
  final bool canManage;
  @override
  ConsumerState<_SlipRow> createState() => _SlipRowState();
}

class _SlipRowState extends ConsumerState<_SlipRow> {
  bool _busy = false;

  Future<void> _pay() async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/payroll/paid', {'payslipId': widget.p['id']});
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Paid.' : 'Could not update.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminPayrollProvider);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.p;
    final paid = p['status'] == 'PAID';
    return AppCard(
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(p['staff']?.toString() ?? '', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text('${p['period'] ?? ''} · ${_inr.format((p['netPay'] ?? 0) as num)}',
              style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
        ])),
        if (paid)
          const StatusChip(label: 'Paid', color: AppColors.good, bg: AppColors.goodSoft)
        else if (widget.canManage)
          GestureDetector(
            onTap: _busy ? null : _pay,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(color: AppColors.goodSoft, borderRadius: BorderRadius.circular(AppRadius.pill)),
              child: const Text('Mark paid', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.good)),
            ),
          )
        else
          StatusChip(label: (p['status'] as String? ?? '').toLowerCase(), color: AppColors.muted, bg: AppColors.line),
      ]),
    );
  }
}
