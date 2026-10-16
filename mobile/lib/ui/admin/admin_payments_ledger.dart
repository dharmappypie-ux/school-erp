import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _compact =
    NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// The receipt ledger: every payment taken, newest first.
///
/// Taking a payment lives in Fees; this is the other half — reading back what
/// was taken, which is what a reconciliation or a refund starts from.
class AdminPaymentsLedgerScreen extends ConsumerStatefulWidget {
  const AdminPaymentsLedgerScreen({super.key});
  @override
  ConsumerState<AdminPaymentsLedgerScreen> createState() =>
      _AdminPaymentsLedgerScreenState();
}

class _AdminPaymentsLedgerScreenState extends ConsumerState<AdminPaymentsLedgerScreen> {
  final _search = TextEditingController();
  String? _query;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(paymentsLedgerProvider(_query));
    final data = async.value;
    final payments = (data?['payments'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final month = (data?['month'] as Map?)?.cast<String, dynamic>() ?? const {};
    final byMode = (data?['byMode'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Payments',
      subtitle: data == null ? 'Loading…' : '${data['total']} receipts',
      icon: Icons.receipt_long_rounded,
      onRefresh: () async => ref.invalidate(paymentsLedgerProvider(_query)),
      children: [
        if (data != null) ...[
          Row(children: [
            Expanded(
              child: StatTile(
                icon: Icons.trending_up_rounded,
                value: _compact.format((month['collected'] as num?) ?? 0),
                label: 'This month · ${month['count'] ?? 0} receipts',
                color: AppColors.good,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: StatTile(
                icon: Icons.account_balance_wallet_rounded,
                value: '${byMode.length}',
                label: 'Payment modes in use',
                color: AppColors.teal,
              ),
            ),
          ]),
          const SizedBox(height: 18),
        ],
        AppTextField(
          controller: _search,
          label: 'Search',
          hint: 'Receipt, reference, student or admission no.',
          onChanged: (v) => setState(() => _query = v.trim().isEmpty ? null : v.trim()),
        ),
        const SizedBox(height: 18),
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (data == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't load the ledger — pull down to retry.",
                    style: TextStyle(color: AppColors.muted)),
              ),
            ]),
          )
        else if (payments.isEmpty)
          const AppCard(
            child: Text('No receipts match.', style: TextStyle(color: AppColors.muted)),
          )
        else
          for (final p in payments) ...[
            _PaymentCard(payment: p),
            const SizedBox(height: 10),
          ],
      ],
    );
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.payment});
  final Map<String, dynamic> payment;

  @override
  Widget build(BuildContext context) {
    final status = payment['status']?.toString() ?? '';
    final refunded = (payment['refunded'] as num?) ?? 0;
    final tone = status == 'SUCCESS'
        ? (refunded > 0 ? AppColors.warn : AppColors.good)
        : status == 'FAILED'
            ? AppColors.danger
            : AppColors.muted;
    final toneBg = status == 'SUCCESS'
        ? (refunded > 0 ? AppColors.warnSoft : AppColors.goodSoft)
        : status == 'FAILED'
            ? AppColors.dangerSoft
            : AppColors.surfaceSunken;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(payment['student']?.toString() ?? '',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(
                    '${payment['receiptNo']} · ${payment['admissionNo']}',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(_money.format((payment['amount'] as num?) ?? 0),
                    style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800)),
                const SizedBox(height: 3),
                StatusChip(
                  label: refunded > 0
                      ? 'Refunded ${_money.format(refunded)}'
                      : status.toLowerCase(),
                  color: tone,
                  bg: toneBg,
                ),
              ],
            ),
          ]),
          const SizedBox(height: 10),
          Text(
            [
              payment['mode']?.toString().toLowerCase(),
              if (payment['gateway'] != null) payment['gateway'],
              if (payment['transactionRef'] != null) payment['transactionRef'],
              (payment['paidAt'] as String?)?.split('T').first,
              if ((payment['invoices'] as List?)?.isNotEmpty == true)
                (payment['invoices'] as List).join(', '),
            ].where((e) => e != null).join(' · '),
            style: const TextStyle(fontSize: 12, color: AppColors.faint),
          ),
        ],
      ),
    );
  }
}
