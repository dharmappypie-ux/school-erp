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
    final vehicles = (async.value?['vehicles'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
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
        if (canManage) ...[
          Row(children: [
            Expanded(child: PrimaryButton(
              label: 'New vehicle', icon: Icons.directions_bus_rounded,
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _VehicleForm())),
            )),
            const SizedBox(width: 12),
            Expanded(child: PrimaryButton(
              label: 'New route', icon: Icons.alt_route_rounded,
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _RouteForm(vehicles: vehicles))),
            )),
          ]),
          const SizedBox(height: 10),
          if (items.isNotEmpty)
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _AssignForm(routes: items))),
              icon: const Icon(Icons.person_pin_circle_rounded, size: 18),
              label: const Text('Assign a student to a route'),
            ),
          const SizedBox(height: 8),
          Text('${vehicles.length} vehicles on fleet', style: const TextStyle(fontSize: 12, color: AppColors.faint)),
          const SizedBox(height: 16),
        ],
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Text('No routes yet. Tap New route to create one.', style: TextStyle(color: AppColors.muted)))
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

class _VehicleForm extends ConsumerStatefulWidget {
  const _VehicleForm();
  @override
  ConsumerState<_VehicleForm> createState() => _VehicleFormState();
}

class _VehicleFormState extends ConsumerState<_VehicleForm> {
  final _reg = TextEditingController();
  final _cap = TextEditingController(text: '40');
  final _driver = TextEditingController();
  final _phone = TextEditingController();
  String _type = 'BUS';
  bool _saving = false;

  Future<void> _save() async {
    if (_reg.text.trim().length < 4) { showToast(context, 'Enter the registration number.', error: true); return; }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/transport/vehicle', {
      'registrationNo': _reg.text.trim(),
      'vehicleType': _type,
      'capacity': int.tryParse(_cap.text.trim()) ?? 40,
      if (_driver.text.trim().isNotEmpty) 'driverName': _driver.text.trim(),
      if (_phone.text.trim().isNotEmpty) 'driverPhone': _phone.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminTransportProvider); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'New vehicle', subtitle: 'Add to the fleet', icon: Icons.directions_bus_rounded,
        children: [
          AppTextField(controller: _reg, label: 'Registration number', required: true),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: AppDropdown<String>(label: 'Type', value: _type,
                items: const ['BUS', 'VAN', 'CAR', 'TEMPO'], itemLabel: (t) => t[0] + t.substring(1).toLowerCase(),
                onChanged: (t) => setState(() => _type = t ?? 'BUS'))),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _cap, label: 'Capacity', keyboard: TextInputType.number)),
          ]),
          const SizedBox(height: 14),
          AppTextField(controller: _driver, label: 'Driver name', hint: 'Optional'),
          const SizedBox(height: 14),
          AppTextField(controller: _phone, label: 'Driver phone', hint: 'Optional', keyboard: TextInputType.phone),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Adding…' : 'Add vehicle', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() { _reg.dispose(); _cap.dispose(); _driver.dispose(); _phone.dispose(); super.dispose(); }
}

class _RouteForm extends ConsumerStatefulWidget {
  const _RouteForm({required this.vehicles});
  final List<Map<String, dynamic>> vehicles;
  @override
  ConsumerState<_RouteForm> createState() => _RouteFormState();
}

class _RouteFormState extends ConsumerState<_RouteForm> {
  final _name = TextEditingController();
  final _start = TextEditingController();
  final _end = TextEditingController();
  Map<String, dynamic>? _vehicle;
  bool _saving = false;

  Future<void> _save() async {
    if (_name.text.trim().length < 2) { showToast(context, 'Name the route.', error: true); return; }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/transport/route-create', {
      'name': _name.text.trim(),
      if (_vehicle != null) 'vehicleId': _vehicle!['id'],
      if (_start.text.trim().isNotEmpty) 'startPoint': _start.text.trim(),
      if (_end.text.trim().isNotEmpty) 'endPoint': _end.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminTransportProvider); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'New route', subtitle: 'Create a transport route', icon: Icons.alt_route_rounded,
        children: [
          AppTextField(controller: _name, label: 'Route name', required: true),
          const SizedBox(height: 14),
          AppDropdown<Map<String, dynamic>>(label: 'Vehicle (optional)', value: _vehicle, items: widget.vehicles,
              itemLabel: (v) => '${v['registrationNo']} · ${v['capacity']} seats',
              onChanged: (v) => setState(() => _vehicle = v)),
          const SizedBox(height: 14),
          AppTextField(controller: _start, label: 'Start point', hint: 'Optional'),
          const SizedBox(height: 14),
          AppTextField(controller: _end, label: 'End point', hint: 'Optional'),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Creating…' : 'Create route', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() { _name.dispose(); _start.dispose(); _end.dispose(); super.dispose(); }
}

/// Assign a student to a route + stop. Pick route → stop, search a student.
class _AssignForm extends ConsumerStatefulWidget {
  const _AssignForm({required this.routes});
  final List<Map<String, dynamic>> routes;
  @override
  ConsumerState<_AssignForm> createState() => _AssignFormState();
}

class _AssignFormState extends ConsumerState<_AssignForm> {
  final _search = TextEditingController();
  Map<String, dynamic>? _route;
  Map<String, dynamic>? _stop;
  Map<String, dynamic>? _student;
  List<Map<String, dynamic>> _results = const [];
  bool _searching = false;
  bool _saving = false;

  Future<void> _doSearch() async {
    final q = _search.text.trim();
    if (q.length < 2) return;
    setState(() => _searching = true);
    final res = await ref.read(apiProvider).getJson('/api/mobile/v1/admin/students', query: {'q': q, 'status': 'ACTIVE'});
    if (!mounted) return;
    setState(() {
      _searching = false;
      _results = (res?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    });
  }

  Future<void> _save() async {
    if (_student == null || _route == null || _stop == null) {
      showToast(context, 'Pick a student, route and stop.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/transport/assign', {
      'studentId': _student!['id'], 'routeId': _route!['id'], 'stopId': _stop!['id'],
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminTransportProvider); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) {
    final stops = (_route?['stops'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    return DetailScaffold(
      title: 'Assign student', subtitle: 'To a route & stop', icon: Icons.person_pin_circle_rounded,
      children: [
        const SectionLabel('Student'),
        if (_student != null)
          AppCard(child: Row(children: [
            const Icon(Icons.check_circle_rounded, color: AppColors.good),
            const SizedBox(width: 10),
            Expanded(child: Text('${_student!['name']} · ${_student!['admissionNo']}',
                style: const TextStyle(fontWeight: FontWeight.w700))),
            TextButton(onPressed: () => setState(() => _student = null), child: const Text('Change')),
          ]))
        else ...[
          Row(children: [
            Expanded(child: AppTextField(controller: _search, label: 'Search name or admission no')),
            const SizedBox(width: 10),
            PrimaryButton(label: 'Search', expand: false, onPressed: _searching ? null : _doSearch),
          ]),
          const SizedBox(height: 10),
          for (final s in _results)
            AppCard(
              onTap: () => setState(() { _student = s; _results = const []; }),
              child: Row(children: [
                Expanded(child: Text('${s['name']} · ${s['admissionNo']}', style: const TextStyle(fontSize: 13.5))),
                const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
              ]),
            ),
        ],
        const SizedBox(height: 18),
        const SectionLabel('Route & stop'),
        AppDropdown<Map<String, dynamic>>(label: 'Route', required: true, value: _route, items: widget.routes,
            itemLabel: (r) => r['name']?.toString() ?? '', onChanged: (r) => setState(() { _route = r; _stop = null; })),
        const SizedBox(height: 14),
        AppDropdown<Map<String, dynamic>>(label: 'Stop', required: true, value: _stop, items: stops,
            itemLabel: (s) => '${s['name']}${s['pickupTime'] != null ? ' · ${s['pickupTime']}' : ''}',
            onChanged: (s) => setState(() => _stop = s)),
        if (_route != null && stops.isEmpty)
          const Padding(padding: EdgeInsets.only(top: 8),
              child: Text('This route has no stops yet. Add a stop first.', style: TextStyle(fontSize: 12, color: AppColors.faint))),
        const SizedBox(height: 22),
        PrimaryButton(label: _saving ? 'Assigning…' : 'Assign student', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
      ],
    );
  }

  @override
  void dispose() { _search.dispose(); super.dispose(); }
}
