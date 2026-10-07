import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/sync_pill.dart';
import '../widgets/widgets.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _day = DateFormat('d MMM');

class FeesScreen extends ConsumerWidget {
  const FeesScreen({super.key, this.pushed = false});

  /// When pushed (e.g. from the module grid) it wraps itself in a Scaffold so it
  /// has the Material ancestor the shell normally provides, and the header shows
  /// a back button instead of the drawer hamburger.
  final bool pushed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invoices = ref.watch(invoicesProvider);

    final content = RefreshIndicator(
      color: AppColors.ink,
      onRefresh: () async {
        await ref.read(syncProvider).sync(manual: true);
        refreshData(ref);
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          const AppScreenHeader(title: 'Fees', trailing: SyncPill()),
          const SizedBox(height: 18),
          invoices.when(
            loading: () => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
            error: (e, _) => AppCard(child: Text('$e')),
            data: (list) => _body(context, list),
          ),
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

  Widget _body(BuildContext context, List<FeeInvoice> list) {
    final due = list.where((i) => i.status != InvoiceStatus.paid).fold<double>(0, (s, i) => s + i.balance);
    final overdue = list.where((i) => i.status == InvoiceStatus.overdue).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DarkCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('TOTAL DUE', style: eyebrow(AppColors.onDarkMuted)),
              const SizedBox(height: 6),
              Text(_inr.format(due),
                  style: const TextStyle(
                      color: AppColors.onDark, fontSize: 36, fontWeight: FontWeight.w800, height: 1)),
              const SizedBox(height: 14),
              Row(
                children: [
                  if (overdue > 0)
                    StatusChip(
                        label: '$overdue overdue',
                        color: const Color(0xFFF2B8B8),
                        bg: Colors.white.withValues(alpha: 0.08),
                        icon: Icons.schedule_rounded),
                  const Spacer(),
                  PrimaryButton(
                    expand: false,
                    label: 'Pay all',
                    icon: Icons.lock_rounded,
                    onPressed: due > 0 ? () => _pay(context, 'all dues') : null,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        const SectionLabel('Invoices'),
        for (final inv in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AppCard(
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(inv.title,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text(
                          inv.status == InvoiceStatus.paid
                              ? 'Paid · ${_inr.format(inv.amount)}'
                              : 'Due ${_day.format(inv.dueDate)} · ${_inr.format(inv.balance)}',
                          style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  _statusView(context, inv),
                ],
              ),
            ),
          ),
        const SizedBox(height: 12),
        const SectionLabel('Payment methods'),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
          child: Column(
            children: [
              RowTile(
                  icon: Icons.account_balance_rounded,
                  title: 'UPI / Net banking',
                  subtitle: 'Pay instantly from your bank',
                  onTap: () => _pay(context, 'UPI')),
              const Hairline(),
              RowTile(
                  icon: Icons.credit_card_rounded,
                  title: 'Card ending 2187',
                  subtitle: 'Visa · auto-pay off',
                  onTap: () => _pay(context, 'card')),
            ],
          ),
        ),
      ],
    );
  }

  Widget _statusView(BuildContext context, FeeInvoice inv) {
    switch (inv.status) {
      case InvoiceStatus.paid:
        return const StatusChip(label: 'Paid', color: AppColors.good, bg: AppColors.goodSoft, icon: Icons.check_rounded);
      case InvoiceStatus.overdue:
        return PrimaryButton(expand: false, label: 'Pay', onPressed: () => _pay(context, inv.title));
      case InvoiceStatus.due:
        return PrimaryButton(expand: false, label: 'Pay', onPressed: () => _pay(context, inv.title));
    }
  }

  void _pay(BuildContext context, String what) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        margin: const EdgeInsets.all(14),
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
            color: AppColors.surface, borderRadius: BorderRadius.circular(AppRadius.card)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.lock_rounded, color: AppColors.accent),
            const SizedBox(height: 10),
            Text('Pay $what',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            const Text(
                'Fee payments open the school’s secure checkout. Coming soon in this preview build.',
                style: TextStyle(fontSize: 13, color: AppColors.muted)),
            const SizedBox(height: 18),
            PrimaryButton(label: 'Got it', onPressed: () => Navigator.pop(context)),
          ],
        ),
      ),
    );
  }
}
