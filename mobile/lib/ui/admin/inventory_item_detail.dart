import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// One stock item and its movement ledger.
///
/// The list screen can only show a quantity; this is what that quantity is made
/// of, which is the question a stock-take actually asks.
class InventoryItemDetailScreen extends ConsumerWidget {
  const InventoryItemDetailScreen({super.key, required this.itemId, required this.name});
  final String itemId;
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(inventoryItemProvider(itemId));
    final data = async.value;
    final item = (data?['item'] as Map?)?.cast<String, dynamic>();
    final movements = (data?['movements'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: item?['name']?.toString() ?? name,
      subtitle: item == null
          ? 'Loading…'
          : [item['category'], item['sku'], item['location']]
              .where((e) => e != null && e.toString().isNotEmpty)
              .join(' · '),
      icon: Icons.inventory_2_rounded,
      onRefresh: () async => ref.invalidate(inventoryItemProvider(itemId)),
      children: [
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (item == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't load this item — pull down to retry.",
                    style: TextStyle(color: AppColors.muted)),
              ),
            ]),
          )
        else ...[
          Row(children: [
            Expanded(
              child: StatTile(
                icon: Icons.numbers_rounded,
                value: '${item['quantity']} ${item['unit'] ?? ''}'.trim(),
                label: item['lowStock'] == true
                    ? 'Low — reorder at ${item['reorderLevel']}'
                    : 'In stock · reorder at ${item['reorderLevel']}',
                color: item['lowStock'] == true ? AppColors.danger : AppColors.good,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: StatTile(
                icon: Icons.sell_rounded,
                value: item['value'] == null
                    ? '—'
                    : _money.format((item['value'] as num).toDouble()),
                label: item['unitCost'] == null
                    ? 'No unit cost recorded'
                    : 'at ${_money.format((item['unitCost'] as num).toDouble())} each',
                color: AppColors.teal,
              ),
            ),
          ]),
          if ((item['notes'] as String?)?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            const SectionLabel('Notes'),
            AppCard(
              child: Text(item['notes'].toString(),
                  style: const TextStyle(fontSize: 13.5, height: 1.45, color: AppColors.muted)),
            ),
          ],
          const SizedBox(height: 20),
          SectionLabel('Movements · ${movements.length}'),
          if (movements.isEmpty)
            const AppCard(
              child: Text('No movements recorded. Receipts, issues and adjustments appear here.',
                  style: TextStyle(color: AppColors.muted, height: 1.4)),
            )
          else
            AppCard(
              child: Column(children: [
                for (var i = 0; i < movements.length; i++) ...[
                  if (i > 0) const Hairline(),
                  _Movement(movements[i], unit: item['unit']?.toString() ?? ''),
                ],
              ]),
            ),
        ],
      ],
    );
  }
}

class _Movement extends StatelessWidget {
  const _Movement(this.m, {required this.unit});
  final Map<String, dynamic> m;
  final String unit;

  static String _typeLabel(String type) => switch (type) {
        'IN' => 'Received',
        'OUT' => 'Issued',
        'ADJUST' => 'Adjusted',
        _ => type,
      };

  @override
  Widget build(BuildContext context) {
    // The server's StockMovementType: IN adds, OUT removes, ADJUST can do
    // either — so an adjustment takes its sign from the quantity, not the word.
    final type = m['type']?.toString() ?? '';
    final quantity = (m['quantity'] as num?) ?? 0;
    final adds = type == 'IN' || (type == 'ADJUST' && quantity >= 0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: adds ? AppColors.goodSoft : AppColors.dangerSoft,
            borderRadius: BorderRadius.circular(11),
          ),
          child: Icon(adds ? Icons.south_west_rounded : Icons.north_east_rounded,
              size: 18, color: adds ? AppColors.good : AppColors.danger),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${_typeLabel(type)}'
                '${m['reference'] != null ? " · ${m['reference']}" : ""}',
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 2),
              Text(
                [
                  (m['at'] as String?)?.split('T').first,
                  'balance ${m['balanceAfter']} $unit'.trim(),
                  if (m['note'] != null) m['note'],
                ].where((e) => e != null).join(' · '),
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ],
          ),
        ),
        Text('${adds ? '+' : ''}$quantity',
            style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w800,
                color: adds ? AppColors.good : AppColors.danger)),
      ]),
    );
  }
}
