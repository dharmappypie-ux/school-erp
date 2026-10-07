import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';
import 'collect_payment.dart';

/// Fees hub for admins: collect, generate invoices, refund, and the invoice list.
class AdminFeesScreen extends ConsumerWidget {
  const AdminFeesScreen({super.key});

  void _open(BuildContext c, Widget s) => Navigator.of(c).push(MaterialPageRoute(builder: (_) => s));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DetailScaffold(
      title: 'Fees',
      subtitle: 'Collect, bill and refund',
      icon: Icons.account_balance_wallet_rounded,
      children: [
        const SectionLabel('Actions'),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
          child: Column(children: [
            RowTile(
              icon: Icons.add_card_rounded, iconBg: AppColors.goodSoft, iconColor: AppColors.good,
              title: 'Collect payment', subtitle: 'Issue a receipt against invoices',
              onTap: () => _open(context, const CollectPaymentScreen()),
            ),
            const Hairline(),
            RowTile(
              icon: Icons.receipt_long_rounded, iconBg: AppColors.accentSoft, iconColor: AppColors.primary,
              title: 'Generate invoices', subtitle: 'Bill a class from a fee structure',
              onTap: () => _open(context, const GenerateInvoicesScreen()),
            ),
            const Hairline(),
            RowTile(
              icon: Icons.replay_rounded, iconBg: AppColors.dangerSoft, iconColor: AppColors.danger,
              title: 'Refund a payment', subtitle: 'Reverse part or all of a receipt',
              onTap: () => _open(context, const RefundScreen()),
            ),
          ]),
        ),
        const SizedBox(height: 22),
        const SectionLabel('Invoices'),
        _InvoicesInline(),
      ],
    );
  }
}

class _InvoicesInline extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(moduleProvider((role: 'admin', name: 'fees')));
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    if (async.isLoading) {
      return const SizedBox(height: 80, child: Center(child: CircularProgressIndicator()));
    }
    if (items.isEmpty) {
      return const AppCard(child: Text('No invoices yet.', style: TextStyle(color: AppColors.muted)));
    }
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Column(children: [
        for (var i = 0; i < items.length && i < 20; i++) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 11),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(items[i]['title']?.toString() ?? '', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                if ((items[i]['subtitle']?.toString() ?? '').isNotEmpty)
                  Text(items[i]['subtitle'].toString(), style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              ])),
              Text(items[i]['trailing']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
          ),
          if (i < items.length - 1 && i < 19) const Hairline(),
        ],
      ]),
    );
  }
}

/// Pick a fee structure → generate invoices for its students.
class GenerateInvoicesScreen extends ConsumerStatefulWidget {
  const GenerateInvoicesScreen({super.key});
  @override
  ConsumerState<GenerateInvoicesScreen> createState() => _GenerateInvoicesScreenState();
}

class _GenerateInvoicesScreenState extends ConsumerState<GenerateInvoicesScreen> {
  String? _structureId;
  bool _saving = false;

  Future<void> _generate() async {
    if (_structureId == null) return;
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/fees/generate', {'structureId': _structureId});
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Invoices issued.' : 'Could not generate.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(moduleProvider((role: 'admin', name: 'fees')));
      ref.invalidate(adminOverviewProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final structures = ref.watch(feeStructuresProvider);
    final items = (structures.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    return DetailScaffold(
      title: 'Generate invoices',
      subtitle: 'Bill every active student in a structure',
      icon: Icons.receipt_long_rounded,
      children: [
        if (structures.isLoading)
          const SizedBox(height: 100, child: Center(child: CircularProgressIndicator()))
        else if (structures.value == null)
          AppCard(child: Row(children: [
            const Icon(Icons.cloud_off_rounded, color: AppColors.warn), const SizedBox(width: 12),
            const Expanded(child: Text("Couldn't load fee structures.", style: TextStyle(color: AppColors.muted))),
            TextButton(onPressed: () => ref.invalidate(feeStructuresProvider), child: const Text('Retry')),
          ]))
        else ...[
          const SectionLabel('Fee structure'),
          AppDropdown<String>(
            label: 'Structure',
            value: _structureId,
            items: items.map((s) => s['id'] as String).toList(),
            itemLabel: (id) {
              final s = items.firstWhere((e) => e['id'] == id, orElse: () => const {});
              return '${s['name'] ?? id} · ${s['className'] ?? ''} · ${s['heads'] ?? 0} heads';
            },
            onChanged: (v) => setState(() => _structureId = v),
          ),
          const SizedBox(height: 24),
          PrimaryButton(
            label: _saving ? 'Generating…' : 'Generate invoices',
            icon: Icons.check_rounded,
            onPressed: (_saving || _structureId == null) ? null : _generate,
          ),
          const SizedBox(height: 8),
          const Center(child: Text('Students already billed from this structure are skipped.',
              style: TextStyle(fontSize: 12, color: AppColors.faint))),
        ],
      ],
    );
  }
}

/// Pick a receipt → refund part or all of it.
class RefundScreen extends ConsumerStatefulWidget {
  const RefundScreen({super.key});
  @override
  ConsumerState<RefundScreen> createState() => _RefundScreenState();
}

class _RefundScreenState extends ConsumerState<RefundScreen> {
  String? _paymentId;
  final _amount = TextEditingController();
  final _reason = TextEditingController();
  bool _saving = false;

  Future<void> _refund(List<Map<String, dynamic>> payments) async {
    if (_paymentId == null) {
      showToast(context, 'Pick a receipt.', error: true);
      return;
    }
    if (_reason.text.trim().length < 3) {
      showToast(context, 'Give a reason for the refund.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/payment/refund', {
      'paymentId': _paymentId,
      'amount': _amount.text.trim(),
      'reason': _reason.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Refunded.' : 'Could not refund.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminPaymentsProvider);
      ref.invalidate(moduleProvider((role: 'admin', name: 'fees')));
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final payments = ref.watch(adminPaymentsProvider);
    final all = (payments.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final refundable = all.where((p) => (p['refundable'] as num? ?? 0) > 0).toList();

    return DetailScaffold(
      title: 'Refund a payment',
      subtitle: 'Reverse part or all of a receipt',
      icon: Icons.replay_rounded,
      children: [
        if (payments.isLoading)
          const SizedBox(height: 100, child: Center(child: CircularProgressIndicator()))
        else if (payments.value == null)
          AppCard(child: Row(children: [
            const Icon(Icons.cloud_off_rounded, color: AppColors.warn), const SizedBox(width: 12),
            const Expanded(child: Text("Couldn't load receipts.", style: TextStyle(color: AppColors.muted))),
            TextButton(onPressed: () => ref.invalidate(adminPaymentsProvider), child: const Text('Retry')),
          ]))
        else ...[
          const SectionLabel('Receipt'),
          AppDropdown<String>(
            label: 'Receipt',
            value: _paymentId,
            items: refundable.map((p) => p['id'] as String).toList(),
            itemLabel: (id) {
              final p = refundable.firstWhere((e) => e['id'] == id, orElse: () => const {});
              return '${p['receiptNo'] ?? id} · ${p['studentName'] ?? ''} · ₹${p['refundable'] ?? 0} left';
            },
            onChanged: (v) {
              setState(() {
                _paymentId = v;
                final p = refundable.firstWhere((e) => e['id'] == v, orElse: () => const {});
                _amount.text = '${p['refundable'] ?? ''}';
              });
            },
          ),
          const SizedBox(height: 16),
          AppTextField(controller: _amount, label: 'Refund amount (₹)', keyboard: TextInputType.number, required: true),
          const SizedBox(height: 16),
          AppTextField(controller: _reason, label: 'Reason', required: true, maxLines: 2),
          const SizedBox(height: 24),
          PrimaryButton(
            label: _saving ? 'Refunding…' : 'Refund payment',
            icon: Icons.check_rounded,
            onPressed: _saving ? null : () => _refund(refundable),
          ),
        ],
      ],
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }
}
