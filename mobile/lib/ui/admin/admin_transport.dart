import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Transport: routes with their stops, and a form to add a stop.
class AdminTransportScreen extends ConsumerWidget {
  const AdminTransportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminTransportProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = async.value?['canManage'] == true;

    return DetailScaffold(
      title: 'Transport',
      subtitle: '${items.length} routes',
      icon: Icons.directions_bus_rounded,
      onRefresh: () async => ref.invalidate(adminTransportProvider),
      fab: canManage && items.isNotEmpty
          ? FloatingActionButton.extended(
              backgroundColor: AppColors.primary, foregroundColor: Colors.white,
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _StopForm(routes: items))),
              icon: const Icon(Icons.add_location_alt_rounded), label: const Text('Add stop'),
            )
          : null,
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Text('No routes yet. Create routes on the web.', style: TextStyle(color: AppColors.muted)))
        else
          for (final r in items) ...[
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(r['name']?.toString() ?? '', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                if ((r['route']?.toString() ?? '').isNotEmpty || r['vehicle'] != null) ...[
                  const SizedBox(height: 2),
                  Text([r['route'], if (r['vehicle'] != null) 'Bus ${r['vehicle']}'].where((e) => (e?.toString() ?? '').isNotEmpty).join(' · '),
                      style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                ],
                const SizedBox(height: 8),
                for (final s in (r['stops'] as List?)?.cast<Map<String, dynamic>>() ?? const [])
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(children: [
                      const Icon(Icons.circle, size: 7, color: AppColors.teal),
                      const SizedBox(width: 10),
                      Expanded(child: Text(s['name']?.toString() ?? '', style: const TextStyle(fontSize: 13))),
                      if (s['pickupTime'] != null)
                        Text(s['pickupTime'].toString(), style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                    ]),
                  ),
                if (((r['stops'] as List?) ?? const []).isEmpty)
                  const Text('No stops yet.', style: TextStyle(fontSize: 12, color: AppColors.faint)),
              ]),
            ),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _StopForm extends ConsumerStatefulWidget {
  const _StopForm({required this.routes});
  final List<Map<String, dynamic>> routes;
  @override
  ConsumerState<_StopForm> createState() => _StopFormState();
}

class _StopFormState extends ConsumerState<_StopForm> {
  String? _routeId;
  final _name = TextEditingController();
  final _pickup = TextEditingController();
  bool _saving = false;

  Future<void> _save() async {
    if (_routeId == null || _name.text.trim().length < 2) {
      showToast(context, 'Pick a route and name the stop.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/transport/stop', {
      'routeId': _routeId, 'name': _name.text.trim(),
      if (_pickup.text.trim().isNotEmpty) 'pickupTime': _pickup.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Added.' : 'Could not add.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminTransportProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'Add a stop',
        subtitle: 'Append a stop to a route',
        icon: Icons.add_location_alt_rounded,
        children: [
          const SectionLabel('Route'),
          AppDropdown<String>(
            label: 'Route',
            value: _routeId,
            items: widget.routes.map((r) => r['id'] as String).toList(),
            itemLabel: (id) => (widget.routes.firstWhere((r) => r['id'] == id, orElse: () => const {})['name'] as String?) ?? id,
            onChanged: (v) => setState(() => _routeId = v),
          ),
          const SizedBox(height: 16),
          AppTextField(controller: _name, label: 'Stop name', required: true),
          const SizedBox(height: 16),
          AppTextField(controller: _pickup, label: 'Pickup time', hint: 'e.g. 07:45'),
          const SizedBox(height: 24),
          PrimaryButton(label: _saving ? 'Adding…' : 'Add stop', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() {
    _name.dispose(); _pickup.dispose();
    super.dispose();
  }
}
