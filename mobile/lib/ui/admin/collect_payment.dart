import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

const _kModes = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'NETBANKING', 'BANK_TRANSFER'];

/// Collects a fee payment against a student → POST /api/mobile/v1/admin/payment.
/// Allocates oldest invoice first, mirroring the web cashier flow.
class CollectPaymentScreen extends ConsumerStatefulWidget {
  const CollectPaymentScreen({super.key});
  @override
  ConsumerState<CollectPaymentScreen> createState() => _CollectPaymentScreenState();
}

class _CollectPaymentScreenState extends ConsumerState<CollectPaymentScreen> {
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _remarks = TextEditingController();
  String? _studentId;
  String _mode = 'CASH';
  bool _saving = false;

  Future<void> _submit() async {
    final amt = double.tryParse(_amount.text.trim());
    if (_studentId == null) {
      showToast(context, 'Pick a student.', error: true);
      return;
    }
    if (amt == null || amt <= 0) {
      showToast(context, 'Enter a valid amount.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/payment', {
      'studentId': _studentId,
      'amount': _amount.text.trim(),
      'mode': _mode,
      if (_reference.text.trim().isNotEmpty) 'reference': _reference.text.trim(),
      if (_remarks.text.trim().isNotEmpty) 'remarks': _remarks.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Payment collected.' : 'Could not collect.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(moduleProvider((role: 'admin', name: 'fees')));
      ref.invalidate(adminOverviewProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final students = ref.watch(adminStudentsProvider);
    final rows = (students.value?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Collect payment',
      subtitle: 'Issues a receipt, oldest invoice first',
      icon: Icons.account_balance_wallet_rounded,
      children: [
        if (students.isLoading)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: AppCard(
              child: Row(children: [
                SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                SizedBox(width: 12),
                Text('Loading students…', style: TextStyle(color: AppColors.muted)),
              ]),
            ),
          )
        else if (students.value == null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: AppCard(
              child: Row(children: [
                const Icon(Icons.cloud_off_rounded, color: AppColors.warn),
                const SizedBox(width: 12),
                const Expanded(child: Text("Couldn't load students — check your connection.",
                    style: TextStyle(color: AppColors.muted))),
                TextButton(onPressed: () => ref.invalidate(adminStudentsProvider), child: const Text('Retry')),
              ]),
            ),
          ),
        const SectionLabel('Payment'),
        AppDropdown<String>(
          label: 'Student',
          required: true,
          value: _studentId,
          items: rows.map((s) => s['id'] as String).toList(),
          itemLabel: (id) {
            final s = rows.firstWhere((e) => e['id'] == id, orElse: () => {});
            final name = (s['name'] as String?) ?? id;
            final cls = (s['className'] as String?) ?? '';
            return cls.isEmpty || cls == '—' ? name : '$name · $cls';
          },
          onChanged: (v) => setState(() => _studentId = v),
        ),
        const SizedBox(height: 16),
        AppTextField(
            controller: _amount, label: 'Amount (₹)', keyboard: TextInputType.number, required: true),
        const SizedBox(height: 16),
        AppDropdown<String>(
          label: 'Mode',
          value: _mode,
          items: _kModes,
          itemLabel: (m) => m.replaceAll('_', ' ').toLowerCase().replaceFirstMapped(RegExp(r'^.'), (m) => m.group(0)!.toUpperCase()),
          onChanged: (v) => setState(() => _mode = v ?? 'CASH'),
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _reference, label: 'Reference / txn no.', hint: 'Optional'),
        const SizedBox(height: 16),
        AppTextField(controller: _remarks, label: 'Remarks', hint: 'Optional', maxLines: 2),
        const SizedBox(height: 26),
        PrimaryButton(
          label: _saving ? 'Collecting…' : 'Collect payment',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _submit,
        ),
        const SizedBox(height: 10),
        const Center(
          child: Text('Applied to the oldest outstanding invoices first.',
              style: TextStyle(fontSize: 12, color: AppColors.faint)),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    _remarks.dispose();
    super.dispose();
  }
}
