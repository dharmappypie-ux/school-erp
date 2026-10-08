import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Academic years: see them, set the current one, create a new one.
class AdminYearsScreen extends ConsumerWidget {
  const AdminYearsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminYearsProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Academic years',
      subtitle: 'Set the current session',
      icon: Icons.event_note_rounded,
      onRefresh: () async => ref.invalidate(adminYearsProvider),
      fab: FloatingActionButton.extended(
        backgroundColor: AppColors.primary, foregroundColor: Colors.white,
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _YearForm())),
        icon: const Icon(Icons.add_rounded), label: const Text('New'),
      ),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Text('No academic years yet. Tap New.', style: TextStyle(color: AppColors.muted)))
        else
          for (final y in items) ...[
            _YearCard(y: y),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _YearCard extends ConsumerStatefulWidget {
  const _YearCard({required this.y});
  final Map<String, dynamic> y;
  @override
  ConsumerState<_YearCard> createState() => _YearCardState();
}

class _YearCardState extends ConsumerState<_YearCard> {
  bool _busy = false;

  Future<void> _setCurrent() async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/years/current', {'yearId': widget.y['id']});
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Done.' : 'Could not update.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminYearsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final y = widget.y;
    final current = y['current'] == true;
    return AppCard(
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(y['name']?.toString() ?? '', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(y['span']?.toString() ?? '', style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
        ])),
        if (current)
          const StatusChip(label: 'Current', color: AppColors.good, bg: AppColors.goodSoft)
        else
          GestureDetector(
            onTap: _busy ? null : _setCurrent,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(color: AppColors.accentSoft, borderRadius: BorderRadius.circular(AppRadius.pill)),
              child: const Text('Set current', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 13)),
            ),
          ),
      ]),
    );
  }
}

class _YearForm extends ConsumerStatefulWidget {
  const _YearForm();
  @override
  ConsumerState<_YearForm> createState() => _YearFormState();
}

class _YearFormState extends ConsumerState<_YearForm> {
  final _name = TextEditingController();
  DateTime? _start;
  DateTime? _end;
  bool _makeCurrent = false;
  bool _saving = false;

  Future<void> _pick(bool start) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: start ? now : DateTime(now.year + 1),
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null) setState(() => start ? _start = picked : _end = picked);
  }

  String _fmt(DateTime? d) => d == null ? 'Choose' : '${d.day}/${d.month}/${d.year}';

  Future<void> _save() async {
    if (_name.text.trim().length < 4 || _start == null || _end == null) {
      showToast(context, 'Enter a name and both dates.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/years', {
      'name': _name.text.trim(),
      'startDate': _start!.toIso8601String(),
      'endDate': _end!.toIso8601String(),
      'makeCurrent': _makeCurrent,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Created.' : 'Could not create.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminYearsProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'New academic year',
        subtitle: 'e.g. 2027-28',
        icon: Icons.event_note_rounded,
        children: [
          const SectionLabel('Year'),
          AppTextField(controller: _name, label: 'Name (e.g. 2027-28)', required: true),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: _DateField(label: 'Start', value: _fmt(_start), onTap: () => _pick(true))),
            const SizedBox(width: 12),
            Expanded(child: _DateField(label: 'End', value: _fmt(_end), onTap: () => _pick(false))),
          ]),
          const SizedBox(height: 10),
          AppCard(child: ToggleRow(
            title: 'Make current',
            subtitle: 'Switch the active session to this year',
            value: _makeCurrent,
            onChanged: (v) => setState(() => _makeCurrent = v),
          )),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Creating…' : 'Create year', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: eyebrow(AppColors.muted)),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), boxShadow: kCardShadow),
            child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ]),
      );
}
