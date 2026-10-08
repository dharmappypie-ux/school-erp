import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Timetable: pick a class, see its weekly slots, and assign a substitute
/// teacher for a slot on a date.
class AdminTimetableScreen extends ConsumerStatefulWidget {
  const AdminTimetableScreen({super.key});
  @override
  ConsumerState<AdminTimetableScreen> createState() => _AdminTimetableScreenState();
}

class _AdminTimetableScreenState extends ConsumerState<AdminTimetableScreen> {
  String? _sectionId;

  @override
  Widget build(BuildContext context) {
    final meta = ref.watch(adminMetaProvider);
    final sections = (meta.value?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final slotsAsync = _sectionId == null ? null : ref.watch(timetableSlotsProvider(_sectionId!));
    final slots = (slotsAsync?.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = slotsAsync?.value?['canManage'] == true;

    // Group by day.
    final byDay = <String, List<Map<String, dynamic>>>{};
    for (final s in slots) {
      byDay.putIfAbsent(s['day']?.toString() ?? '', () => []).add(s);
    }

    return DetailScaffold(
      title: 'Timetable',
      subtitle: 'View a class & assign substitutes',
      icon: Icons.calendar_month_rounded,
      onRefresh: () async {
        ref.invalidate(adminMetaProvider);
        if (_sectionId != null) ref.invalidate(timetableSlotsProvider(_sectionId!));
      },
      children: [
        const SectionLabel('Class'),
        AppDropdown<String>(
          label: 'Class section',
          value: _sectionId,
          items: sections.map((s) => s['id'] as String).toList(),
          itemLabel: (id) => (sections.firstWhere((s) => s['id'] == id, orElse: () => const {})['name'] as String?) ?? id,
          onChanged: (v) => setState(() => _sectionId = v),
        ),
        const SizedBox(height: 18),
        if (_sectionId == null)
          const AppCard(child: Text('Pick a class to see its timetable.', style: TextStyle(color: AppColors.muted)))
        else if (slotsAsync!.isLoading)
          const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
        else if (slots.isEmpty)
          const AppCard(child: Text('No timetable set for this class yet.', style: TextStyle(color: AppColors.muted)))
        else
          for (final day in byDay.keys) ...[
            SectionLabel(day),
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Column(children: [
                for (var i = 0; i < byDay[day]!.length; i++) ...[
                  InkWell(
                    onTap: canManage
                        ? () => Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => _SubstituteForm(slot: byDay[day]![i], sectionId: _sectionId!)))
                        : null,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 11),
                      child: Row(children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(byDay[day]![i]['subject']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('${byDay[day]![i]['period'] ?? ''} · ${byDay[day]![i]['teacher'] ?? ''}',
                              style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        ])),
                        if (canManage) const Icon(Icons.swap_horiz_rounded, size: 18, color: AppColors.primary),
                      ]),
                    ),
                  ),
                  if (i < byDay[day]!.length - 1) const Hairline(),
                ],
              ]),
            ),
            const SizedBox(height: 16),
          ],
      ],
    );
  }
}

class _SubstituteForm extends ConsumerStatefulWidget {
  const _SubstituteForm({required this.slot, required this.sectionId});
  final Map<String, dynamic> slot;
  final String sectionId;
  @override
  ConsumerState<_SubstituteForm> createState() => _SubstituteFormState();
}

class _SubstituteFormState extends ConsumerState<_SubstituteForm> {
  DateTime _date = DateTime.now();
  String? _teacherId;
  final _reason = TextEditingController();
  bool _saving = false;

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context, initialDate: _date,
      firstDate: now.subtract(const Duration(days: 7)), lastDate: now.add(const Duration(days: 180)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _save() async {
    if (_teacherId == null) {
      showToast(context, 'Choose a substitute teacher.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/timetable/substitute', {
      'slotId': widget.slot['id'],
      'substituteId': _teacherId,
      'date': DateFormat('yyyy-MM-dd').format(_date),
      if (_reason.text.trim().isNotEmpty) 'reason': _reason.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Assigned.' : 'Could not assign.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(adminStaffProvider);
    final teachers = ((staff.value?['staff'] as List?)?.cast<Map<String, dynamic>>() ?? const [])
        .where((s) => s['staffType'] == 'TEACHING').toList();

    return DetailScaffold(
      title: 'Assign substitute',
      subtitle: '${widget.slot['subject'] ?? ''} · ${widget.slot['period'] ?? ''}',
      icon: Icons.swap_horiz_rounded,
      children: [
        AppCard(child: Row(children: [
          const Icon(Icons.person_rounded, color: AppColors.muted), const SizedBox(width: 12),
          Expanded(child: Text('Normally: ${widget.slot['teacher'] ?? '—'}', style: const TextStyle(color: AppColors.muted))),
        ])),
        const SizedBox(height: 18),
        const SectionLabel('Date'),
        GestureDetector(
          onTap: _pickDate,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), boxShadow: kCardShadow),
            child: Row(children: [
              const Icon(Icons.event_rounded, color: AppColors.primary, size: 20),
              const SizedBox(width: 12),
              Text(DateFormat('EEE, d MMM yyyy').format(_date), style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        const SectionLabel('Substitute'),
        AppDropdown<String>(
          label: 'Teacher',
          value: _teacherId,
          items: teachers.map((t) => t['id'] as String).toList(),
          itemLabel: (id) => (teachers.firstWhere((t) => t['id'] == id, orElse: () => const {})['name'] as String?) ?? id,
          onChanged: (v) => setState(() => _teacherId = v),
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _reason, label: 'Reason', hint: 'Optional'),
        const SizedBox(height: 24),
        PrimaryButton(label: _saving ? 'Assigning…' : 'Assign substitute', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
      ],
    );
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }
}
