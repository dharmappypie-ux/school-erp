import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Inventory hub: add an item, record stock movements, see current stock.
class AdminInventoryScreen extends ConsumerWidget {
  const AdminInventoryScreen({super.key});
  void _open(BuildContext c, Widget s) => Navigator.of(c).push(MaterialPageRoute(builder: (_) => s));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(inventoryItemsProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Inventory',
      subtitle: 'Stock items & movements',
      icon: Icons.inventory_2_rounded,
      onRefresh: () async => ref.invalidate(inventoryItemsProvider),
      children: [
        const SectionLabel('Actions'),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
          child: Column(children: [
            RowTile(
              icon: Icons.add_box_rounded, iconBg: AppColors.tealSoft, iconColor: AppColors.teal,
              title: 'Add item', subtitle: 'Create a stock item',
              onTap: () => _open(context, const _ItemForm()),
            ),
            const Hairline(),
            RowTile(
              icon: Icons.swap_vert_rounded, iconBg: AppColors.accentSoft, iconColor: AppColors.primary,
              title: 'Record movement', subtitle: 'Stock in, out or adjust',
              onTap: () => _open(context, const _MovementForm()),
            ),
          ]),
        ),
        const SizedBox(height: 22),
        SectionLabel('Stock (${items.length})'),
        if (async.isLoading)
          const SizedBox(height: 80, child: Center(child: CircularProgressIndicator()))
        else if (items.isEmpty)
          const AppCard(child: Text('No items yet. Tap Add item.', style: TextStyle(color: AppColors.muted)))
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(children: [
              for (var i = 0; i < items.length; i++) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  child: Row(children: [
                    Expanded(child: Text(items[i]['name']?.toString() ?? '',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))),
                    if (items[i]['low'] == true)
                      const Padding(padding: EdgeInsets.only(right: 8),
                          child: Icon(Icons.warning_amber_rounded, size: 16, color: AppColors.warn)),
                    Text('${items[i]['quantity']} ${items[i]['unit'] ?? ''}',
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ]),
                ),
                if (i < items.length - 1) const Hairline(),
              ],
            ]),
          ),
      ],
    );
  }
}

class _ItemForm extends ConsumerStatefulWidget {
  const _ItemForm();
  @override
  ConsumerState<_ItemForm> createState() => _ItemFormState();
}

class _ItemFormState extends ConsumerState<_ItemForm> {
  final _name = TextEditingController();
  final _sku = TextEditingController();
  final _unit = TextEditingController();
  final _qty = TextEditingController();
  final _reorder = TextEditingController();
  bool _saving = false;

  Future<void> _save() async {
    if (_name.text.trim().length < 2) {
      showToast(context, 'Enter an item name.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/inventory/item', {
      'name': _name.text.trim(),
      if (_sku.text.trim().isNotEmpty) 'sku': _sku.text.trim(),
      if (_unit.text.trim().isNotEmpty) 'unit': _unit.text.trim(),
      if (_qty.text.trim().isNotEmpty) 'quantity': _qty.text.trim(),
      if (_reorder.text.trim().isNotEmpty) 'reorderLevel': _reorder.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Added.' : 'Could not add.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(inventoryItemsProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'Add item',
        subtitle: 'Create a stock item',
        icon: Icons.add_box_rounded,
        children: [
          const SectionLabel('Item'),
          AppTextField(controller: _name, label: 'Name', required: true),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: AppTextField(controller: _sku, label: 'SKU', hint: 'Optional')),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _unit, label: 'Unit', hint: 'e.g. box')),
          ]),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: AppTextField(controller: _qty, label: 'Opening qty', keyboard: TextInputType.number)),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _reorder, label: 'Reorder level', keyboard: TextInputType.number)),
          ]),
          const SizedBox(height: 24),
          PrimaryButton(label: _saving ? 'Adding…' : 'Add item', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() {
    _name.dispose(); _sku.dispose(); _unit.dispose(); _qty.dispose(); _reorder.dispose();
    super.dispose();
  }
}

class _MovementForm extends ConsumerStatefulWidget {
  const _MovementForm();
  @override
  ConsumerState<_MovementForm> createState() => _MovementFormState();
}

class _MovementFormState extends ConsumerState<_MovementForm> {
  String? _itemId;
  String _type = 'IN';
  final _qty = TextEditingController();
  final _note = TextEditingController();
  bool _saving = false;

  Future<void> _save(List<Map<String, dynamic>> items) async {
    if (_itemId == null || _qty.text.trim().isEmpty) {
      showToast(context, 'Pick an item and a quantity.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/inventory/movement', {
      'itemId': _itemId, 'type': _type, 'quantity': _qty.text.trim(),
      if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Recorded.' : 'Could not record.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(inventoryItemsProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final inv = ref.watch(inventoryItemsProvider);
    final items = (inv.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    return DetailScaffold(
      title: 'Record movement',
      subtitle: 'Stock in, out or adjust',
      icon: Icons.swap_vert_rounded,
      children: [
        const SectionLabel('Movement'),
        AppDropdown<String>(
          label: 'Item',
          value: _itemId,
          items: items.map((i) => i['id'] as String).toList(),
          itemLabel: (id) {
            final i = items.firstWhere((e) => e['id'] == id, orElse: () => const {});
            return '${i['name'] ?? id} · ${i['quantity'] ?? 0} ${i['unit'] ?? ''}';
          },
          onChanged: (v) => setState(() => _itemId = v),
        ),
        const SizedBox(height: 16),
        AppDropdown<String>(
          label: 'Type',
          value: _type,
          items: const ['IN', 'OUT', 'ADJUST'],
          itemLabel: (t) => t == 'IN' ? 'Stock in' : t == 'OUT' ? 'Stock out' : 'Adjust to count',
          onChanged: (v) => setState(() => _type = v ?? 'IN'),
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _qty, label: _type == 'ADJUST' ? 'New counted total' : 'Quantity', keyboard: TextInputType.number, required: true),
        const SizedBox(height: 16),
        AppTextField(controller: _note, label: 'Note', hint: 'Optional'),
        const SizedBox(height: 24),
        PrimaryButton(label: _saving ? 'Saving…' : 'Record movement', icon: Icons.check_rounded, onPressed: _saving ? null : () => _save(items)),
      ],
    );
  }

  @override
  void dispose() {
    _qty.dispose(); _note.dispose();
    super.dispose();
  }
}
