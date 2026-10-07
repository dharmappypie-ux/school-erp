import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

const _kCategories = [
  'Salaries', 'Utilities', 'Maintenance', 'Transport', 'Supplies',
  'Events', 'Infrastructure', 'Marketing', 'Miscellaneous',
];
const _kModes = ['CASH', 'CHEQUE', 'UPI', 'CARD', 'NETBANKING', 'BANK_TRANSFER'];

/// Records a school expense → POST /api/mobile/v1/admin/expense.
class CreateExpenseScreen extends ConsumerStatefulWidget {
  const CreateExpenseScreen({super.key});
  @override
  ConsumerState<CreateExpenseScreen> createState() => _CreateExpenseScreenState();
}

class _CreateExpenseScreenState extends ConsumerState<CreateExpenseScreen> {
  final _amount = TextEditingController();
  final _paidTo = TextEditingController();
  final _desc = TextEditingController();
  String _category = _kCategories.first;
  String _mode = 'BANK_TRANSFER';
  bool _saving = false;

  Future<void> _submit() async {
    final amt = double.tryParse(_amount.text.trim());
    if (amt == null || amt <= 0) {
      showToast(context, 'Enter a valid amount.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/expense', {
      'category': _category,
      'amount': _amount.text.trim(),
      'mode': _mode,
      if (_paidTo.text.trim().isNotEmpty) 'paidTo': _paidTo.text.trim(),
      if (_desc.text.trim().isNotEmpty) 'description': _desc.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Expense recorded.' : 'Could not record.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(moduleProvider((role: 'admin', name: 'expenses')));
      ref.invalidate(adminOverviewProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return DetailScaffold(
      title: 'Record expense',
      subtitle: 'Logs a voucher against the school',
      icon: Icons.payments_rounded,
      children: [
        const SectionLabel('Details'),
        AppDropdown<String>(
          label: 'Category',
          required: true,
          value: _category,
          items: _kCategories,
          itemLabel: (c) => c,
          onChanged: (v) => setState(() => _category = v ?? _kCategories.first),
        ),
        const SizedBox(height: 16),
        AppTextField(
            controller: _amount, label: 'Amount (₹)', keyboard: TextInputType.number, required: true),
        const SizedBox(height: 16),
        AppDropdown<String>(
          label: 'Payment mode',
          value: _mode,
          items: _kModes,
          itemLabel: (m) => m.replaceAll('_', ' ').toLowerCase().replaceFirstMapped(RegExp(r'^.'), (m) => m.group(0)!.toUpperCase()),
          onChanged: (v) => setState(() => _mode = v ?? 'BANK_TRANSFER'),
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _paidTo, label: 'Paid to', hint: 'Optional'),
        const SizedBox(height: 16),
        AppTextField(controller: _desc, label: 'Description', hint: 'Optional', maxLines: 3),
        const SizedBox(height: 26),
        PrimaryButton(
          label: _saving ? 'Recording…' : 'Record expense',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _submit,
        ),
      ],
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    _paidTo.dispose();
    _desc.dispose();
    super.dispose();
  }
}
