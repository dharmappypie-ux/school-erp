import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Hostel: rooms with free beds, current allocations (vacate), and allocate.
class AdminHostelScreen extends ConsumerWidget {
  const AdminHostelScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminHostelProvider);
    final rooms = (async.value?['rooms'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final allocations = (async.value?['allocations'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final blocks = (async.value?['blocks'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final wardens = (async.value?['wardens'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = async.value?['canManage'] == true;

    return DetailScaffold(
      title: 'Hostel',
      subtitle: '${rooms.length} rooms · ${allocations.length} allocated',
      icon: Icons.night_shelter_rounded,
      onRefresh: () async => ref.invalidate(adminHostelProvider),
      fab: canManage
          ? FloatingActionButton.extended(
              backgroundColor: AppColors.primary, foregroundColor: Colors.white,
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _AllocateForm(rooms: rooms))),
              icon: const Icon(Icons.add_rounded), label: const Text('Allocate'),
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
        else ...[
          if (canManage) ...[
            Row(children: [
              Expanded(child: PrimaryButton(
                label: 'New block', icon: Icons.apartment_rounded,
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _BlockForm(wardens: wardens))),
              )),
              const SizedBox(width: 12),
              Expanded(child: PrimaryButton(
                label: 'New room', icon: Icons.meeting_room_rounded,
                onPressed: blocks.isEmpty ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _RoomForm(blocks: blocks))),
              )),
            ]),
            if (blocks.isEmpty)
              const Padding(padding: EdgeInsets.only(top: 8),
                  child: Text('Create a block first, then add rooms to it.', style: TextStyle(fontSize: 12, color: AppColors.faint))),
            const SizedBox(height: 18),
          ],
          SectionLabel('Allocations (${allocations.length})'),
          if (allocations.isEmpty)
            const AppCard(child: Text('Nobody allocated yet.', style: TextStyle(color: AppColors.muted)))
          else
            for (final a in allocations) ...[
              _AllocRow(a: a, canManage: canManage),
              const SizedBox(height: 10),
            ],
          const SizedBox(height: 18),
          SectionLabel('Rooms (${rooms.length})'),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(children: [
              for (var i = 0; i < rooms.length; i++) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  child: Row(children: [
                    Expanded(child: Text(rooms[i]['label']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w600))),
                    Text('${rooms[i]['occupied']}/${rooms[i]['capacity']}',
                        style: TextStyle(fontWeight: FontWeight.w800, color: (rooms[i]['free'] ?? 0) == 0 ? AppColors.danger : AppColors.good)),
                  ]),
                ),
                if (i < rooms.length - 1) const Hairline(),
              ],
            ]),
          ),
        ],
      ],
    );
  }
}

class _AllocRow extends ConsumerStatefulWidget {
  const _AllocRow({required this.a, required this.canManage});
  final Map<String, dynamic> a;
  final bool canManage;
  @override
  ConsumerState<_AllocRow> createState() => _AllocRowState();
}

class _AllocRowState extends ConsumerState<_AllocRow> {
  bool _busy = false;
  Future<void> _vacate() async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/hostel/vacate', {'allocationId': widget.a['id']});
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Vacated.' : 'Could not vacate.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminHostelProvider);
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    return AppCard(
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(a['student']?.toString() ?? '', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(a['room']?.toString() ?? '', style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
        ])),
        if (widget.canManage)
          GestureDetector(
            onTap: _busy ? null : _vacate,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(color: AppColors.dangerSoft, borderRadius: BorderRadius.circular(AppRadius.pill)),
              child: const Text('Vacate', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.danger)),
            ),
          ),
      ]),
    );
  }
}

class _AllocateForm extends ConsumerStatefulWidget {
  const _AllocateForm({required this.rooms});
  final List<Map<String, dynamic>> rooms;
  @override
  ConsumerState<_AllocateForm> createState() => _AllocateFormState();
}

class _AllocateFormState extends ConsumerState<_AllocateForm> {
  String? _roomId;
  String? _studentId;
  final _bed = TextEditingController();
  bool _saving = false;

  Future<void> _save() async {
    if (_roomId == null || _studentId == null) {
      showToast(context, 'Pick a room and a student.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/hostel/allocate', {
      'roomId': _roomId, 'studentId': _studentId,
      if (_bed.text.trim().isNotEmpty) 'bedNumber': _bed.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Allocated.' : 'Could not allocate.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminHostelProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final students = ref.watch(adminStudentsProvider);
    final sItems = (students.value?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final freeRooms = widget.rooms.where((r) => (r['free'] as num? ?? 0) > 0).toList();

    return DetailScaffold(
      title: 'Allocate a bed',
      subtitle: 'Give a student a hostel room',
      icon: Icons.night_shelter_rounded,
      children: [
        const SectionLabel('Room'),
        AppDropdown<String>(
          label: 'Room (free beds)',
          value: _roomId,
          items: freeRooms.map((r) => r['id'] as String).toList(),
          itemLabel: (id) {
            final r = freeRooms.firstWhere((e) => e['id'] == id, orElse: () => const {});
            return '${r['label'] ?? id} · ${r['free'] ?? 0} free';
          },
          onChanged: (v) => setState(() => _roomId = v),
        ),
        const SizedBox(height: 16),
        const SectionLabel('Student'),
        AppDropdown<String>(
          label: 'Student',
          value: _studentId,
          items: sItems.map((s) => s['id'] as String).toList(),
          itemLabel: (id) => (sItems.firstWhere((e) => e['id'] == id, orElse: () => const {})['name'] as String?) ?? id,
          onChanged: (v) => setState(() => _studentId = v),
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _bed, label: 'Bed number', hint: 'Optional'),
        const SizedBox(height: 24),
        PrimaryButton(label: _saving ? 'Allocating…' : 'Allocate', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
      ],
    );
  }

  @override
  void dispose() {
    _bed.dispose();
    super.dispose();
  }
}

class _BlockForm extends ConsumerStatefulWidget {
  const _BlockForm({required this.wardens});
  final List<Map<String, dynamic>> wardens;
  @override
  ConsumerState<_BlockForm> createState() => _BlockFormState();
}

class _BlockFormState extends ConsumerState<_BlockForm> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  String _type = 'BOYS';
  Map<String, dynamic>? _warden;
  bool _saving = false;

  Future<void> _save() async {
    if (_name.text.trim().length < 2) { showToast(context, 'Name the block.', error: true); return; }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/hostel/block', {
      'name': _name.text.trim(),
      'type': _type,
      if (_phone.text.trim().isNotEmpty) 'contactPhone': _phone.text.trim(),
      if (_warden != null) 'wardenId': _warden!['id'],
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminHostelProvider); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'New block', subtitle: 'Hostel block', icon: Icons.apartment_rounded,
        children: [
          AppTextField(controller: _name, label: 'Block name', required: true),
          const SizedBox(height: 14),
          AppDropdown<String>(label: 'Type', value: _type, items: const ['BOYS', 'GIRLS', 'MIXED'],
              itemLabel: (t) => t[0] + t.substring(1).toLowerCase(), onChanged: (t) => setState(() => _type = t ?? 'BOYS')),
          const SizedBox(height: 14),
          AppDropdown<Map<String, dynamic>>(label: 'Warden (optional)', value: _warden, items: widget.wardens,
              itemLabel: (w) => w['name']?.toString() ?? '', onChanged: (w) => setState(() => _warden = w)),
          const SizedBox(height: 14),
          AppTextField(controller: _phone, label: 'Contact phone', hint: 'Optional', keyboard: TextInputType.phone),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Creating…' : 'Create block', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() { _name.dispose(); _phone.dispose(); super.dispose(); }
}

class _RoomForm extends ConsumerStatefulWidget {
  const _RoomForm({required this.blocks});
  final List<Map<String, dynamic>> blocks;
  @override
  ConsumerState<_RoomForm> createState() => _RoomFormState();
}

class _RoomFormState extends ConsumerState<_RoomForm> {
  final _number = TextEditingController();
  final _floor = TextEditingController();
  final _cap = TextEditingController(text: '2');
  final _fee = TextEditingController();
  Map<String, dynamic>? _block;
  String _roomType = 'DOUBLE';
  bool _saving = false;

  Future<void> _save() async {
    if (_block == null || _number.text.trim().isEmpty) { showToast(context, 'Choose a block and room number.', error: true); return; }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/hostel/room', {
      'hostelId': _block!['id'],
      'roomNumber': _number.text.trim(),
      if (_floor.text.trim().isNotEmpty) 'floor': _floor.text.trim(),
      'capacity': int.tryParse(_cap.text.trim()) ?? 2,
      'roomType': _roomType,
      if (_fee.text.trim().isNotEmpty) 'monthlyFee': num.tryParse(_fee.text.trim()) ?? 0,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminHostelProvider); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'New room', subtitle: 'Add to a block', icon: Icons.meeting_room_rounded,
        children: [
          AppDropdown<Map<String, dynamic>>(label: 'Block', required: true, value: _block, items: widget.blocks,
              itemLabel: (b) => '${b['name']} (${(b['type'] ?? '').toString().toLowerCase()})', onChanged: (b) => setState(() => _block = b)),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: AppTextField(controller: _number, label: 'Room number', required: true)),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _floor, label: 'Floor', hint: 'Optional')),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: AppDropdown<String>(label: 'Type', value: _roomType,
                items: const ['SINGLE', 'DOUBLE', 'TRIPLE', 'DORMITORY'], itemLabel: (t) => t[0] + t.substring(1).toLowerCase(),
                onChanged: (t) => setState(() => _roomType = t ?? 'DOUBLE'))),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _cap, label: 'Capacity', keyboard: TextInputType.number)),
          ]),
          const SizedBox(height: 14),
          AppTextField(controller: _fee, label: 'Monthly fee', hint: 'Optional', keyboard: TextInputType.number),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Adding…' : 'Add room', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() { _number.dispose(); _floor.dispose(); _cap.dispose(); _fee.dispose(); super.dispose(); }
}
