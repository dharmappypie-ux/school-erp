import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _day = DateFormat('d MMM yyyy');

({Color c, Color bg, String label}) _invStatus(String s, bool overdue) {
  if (overdue) return (c: AppColors.danger, bg: AppColors.dangerSoft, label: 'overdue');
  return switch (s) {
    'PAID' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'paid'),
    'PARTIALLY_PAID' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'part paid'),
    'ISSUED' => (c: AppColors.primary, bg: AppColors.accentSoft, label: 'issued'),
    _ => (c: AppColors.muted, bg: AppColors.line, label: s.replaceAll('_', ' ').toLowerCase()),
  };
}

/// The child's fee record — totals, every invoice with its line items, and the
/// receipts issued to date. Mobile mirror of /portal/fees.
class FeesScreen extends ConsumerWidget {
  const FeesScreen({super.key, this.pushed = false});
  final bool pushed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(parentFeesProvider);
    final content = RefreshIndicator(
      color: AppColors.ink,
      onRefresh: () async => ref.invalidate(parentFeesProvider),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          const AppScreenHeader(title: 'Fees'),
          const SizedBox(height: 18),
          if (async.isLoading)
            const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
          else if (async.value == null)
            const AppCard(child: Text("Couldn't reach the school — pull down to retry.",
                style: TextStyle(color: AppColors.muted)))
          else
            ..._body(context, async.value!),
        ],
      ),
    );
    if (pushed) {
      return Scaffold(
        backgroundColor: AppColors.bg,
        body: SafeArea(bottom: false, child: content),
      );
    }
    return content;
  }

  List<Widget> _body(BuildContext context, Map<String, dynamic> d) {
    final billed = (d['billed'] as num?)?.toDouble() ?? 0;
    final paid = (d['paid'] as num?)?.toDouble() ?? 0;
    final outstanding = (d['outstanding'] as num?)?.toDouble() ?? 0;
    final invoices = (d['invoices'] as List? ?? const []).cast<Map<String, dynamic>>();
    final payments = (d['payments'] as List? ?? const []).cast<Map<String, dynamic>>();
    final overdue = invoices.where((i) => i['overdue'] == true).toList();
    final progress = billed > 0 ? (paid / billed) : 0.0;

    return [
      DarkCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('OUTSTANDING', style: eyebrow(AppColors.onDarkMuted)),
            const SizedBox(height: 6),
            Text(_inr.format(outstanding),
                style: const TextStyle(
                    color: AppColors.onDark, fontSize: 36, fontWeight: FontWeight.w800, height: 1)),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(child: _darkStat('Billed', _inr.format(billed))),
                Expanded(child: _darkStat('Paid', _inr.format(paid))),
              ],
            ),
            const SizedBox(height: 14),
            ProgressBar(value: progress, color: Colors.white, height: 7),
            const SizedBox(height: 6),
            Text('${(progress * 100).toStringAsFixed(1)}% paid',
                style: TextStyle(fontSize: 12, color: AppColors.onDarkMuted)),
          ],
        ),
      ),
      if (overdue.isNotEmpty) ...[
        const SizedBox(height: 14),
        AppCard(
          child: Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: AppColors.danger),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  '${overdue.length} invoice${overdue.length == 1 ? ' is' : 's are'} past the due date. Please contact the school office to settle.',
                  style: const TextStyle(color: AppColors.danger, fontSize: 13, height: 1.35),
                ),
              ),
            ],
          ),
        ),
      ],
      const SizedBox(height: 22),
      const SectionLabel('Invoices'),
      if (invoices.isEmpty)
        const AppCard(child: Text('No invoices raised yet.', style: TextStyle(color: AppColors.muted)))
      else
        for (final inv in invoices) _InvoiceCard(inv),
      const SizedBox(height: 16),
      const SectionLabel('Payment history'),
      if (payments.isEmpty)
        const AppCard(child: Text('No payments recorded yet.', style: TextStyle(color: AppColors.muted)))
      else
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Column(
            children: [
              for (int i = 0; i < payments.length; i++) ...[
                if (i > 0) const Hairline(),
                _paymentRow(payments[i]),
              ],
            ],
          ),
        ),
      const SizedBox(height: 14),
      const Text(
        'Online payment isn’t enabled on this deployment yet. Please pay at the school office, and receipts will appear here.',
        style: TextStyle(fontSize: 12, color: AppColors.faint, height: 1.4),
      ),
    ];
  }

  Widget _darkStat(String label, String value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: eyebrow(AppColors.onDarkMuted)),
          const SizedBox(height: 3),
          Text(value, style: const TextStyle(color: AppColors.onDark, fontSize: 16, fontWeight: FontWeight.w700)),
        ],
      );

  Widget _paymentRow(Map<String, dynamic> p) {
    final paidAt = DateTime.tryParse(p['paidAt']?.toString() ?? '');
    final mode = (p['mode']?.toString() ?? '').replaceAll('_', ' ').toLowerCase();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p['receiptNo']?.toString() ?? '—',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, fontFeatures: [])),
                const SizedBox(height: 2),
                Text('${paidAt != null ? _day.format(paidAt) : ''}${mode.isNotEmpty ? ' · $mode' : ''}',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              ],
            ),
          ),
          Text(_inr.format((p['amount'] as num?)?.toDouble() ?? 0),
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.good)),
        ],
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard(this.inv);
  final Map<String, dynamic> inv;

  @override
  Widget build(BuildContext context) {
    final status = inv['status']?.toString() ?? '';
    final overdue = inv['overdue'] == true;
    final st = _invStatus(status, overdue);
    final lines = (inv['lines'] as List? ?? const []).cast<Map<String, dynamic>>();
    final due = DateTime.tryParse(inv['dueDate']?.toString() ?? '');
    final issued = DateTime.tryParse(inv['issueDate']?.toString() ?? '');
    final amountDue = (inv['amountDue'] as num?)?.toDouble() ?? 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(inv['period']?.toString() ?? 'Fee invoice',
                                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                          ),
                          const SizedBox(width: 8),
                          Text(inv['invoiceNo']?.toString() ?? '',
                              style: const TextStyle(fontSize: 11, color: AppColors.faint)),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${issued != null ? 'Issued ${_day.format(issued)}' : ''}'
                        '${due != null ? ' · due ${_day.format(due)}' : ''}',
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(_inr.format((inv['total'] as num?)?.toDouble() ?? 0),
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    StatusChip(label: st.label, color: st.c, bg: st.bg),
                  ],
                ),
              ],
            ),
            if (lines.isNotEmpty) ...[
              const SizedBox(height: 12),
              const Hairline(),
              const SizedBox(height: 8),
              for (final l in lines)
                Padding(
                  padding: const EdgeInsets.only(bottom: 5),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(l['description']?.toString() ?? '',
                            style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                      ),
                      Text(_inr.format((l['amount'] as num?)?.toDouble() ?? 0),
                          style: const TextStyle(fontSize: 12.5, color: AppColors.ink)),
                    ],
                  ),
                ),
              if (amountDue > 0) ...[
                const SizedBox(height: 4),
                const Hairline(),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Expanded(
                      child: Text('Balance due',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                    ),
                    Text(_inr.format(amountDue),
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.danger)),
                  ],
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
