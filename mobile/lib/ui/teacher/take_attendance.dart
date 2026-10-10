import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _dateFmt = DateFormat('EEE, d MMM');
// Five fits a phone row beside the roll number and an ellipsised name; a sixth
// squeezes the name too far. EXCUSED is therefore web-only — it is rare, and a
// teacher marking the register on a phone needs the common cases to stay large
// enough to hit.
const _statuses = [
  ('PRESENT', 'P', AppColors.good),
  ('ABSENT', 'A', AppColors.danger),
  ('LATE', 'L', AppColors.warn),
  // A student collected after recess or leaving at the end of the second
  // period is the ordinary case; recording it as a full absence misstates the
  // attendance percentage every board return depends on.
  ('HALF_DAY', '\u00bd', AppColors.teal),
  ('ON_LEAVE', 'Lv', AppColors.primary),
];

class TakeAttendanceScreen extends ConsumerStatefulWidget {
  const TakeAttendanceScreen({super.key, required this.sectionId, required this.sectionName});
  final String sectionId;
  final String sectionName;

  @override
  ConsumerState<TakeAttendanceScreen> createState() => _TakeAttendanceScreenState();
}

class _TakeAttendanceScreenState extends ConsumerState<TakeAttendanceScreen> {
  final _marks = <String, String>{}; // studentId -> status
  bool _saving = false;
  late final String _date;

  @override
  void initState() {
    super.initState();
    _date = DateFormat('yyyy-MM-dd').format(DateTime.now());
  }

  Future<void> _submit(List<Map<String, dynamic>> students) async {
    setState(() => _saving = true);
    final entries = students
        .map((s) => {'studentId': s['id'], 'status': _marks[s['id']] ?? 'PRESENT'})
        .toList();
    final res = await ref.read(apiProvider).postJson(
      '/api/mobile/v1/teacher/attendance',
      {'sectionId': widget.sectionId, 'date': _date, 'entries': entries},
    );
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Saved.' : 'Could not save.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(sectionStudentsProvider((sectionId: widget.sectionId, date: _date)));
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(sectionStudentsProvider((sectionId: widget.sectionId, date: _date)));
    final students =
        (async.value?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    // Seed defaults from any already-recorded status.
    for (final s in students) {
      _marks.putIfAbsent(s['id'] as String, () => (s['status'] as String?) ?? 'PRESENT');
    }

    final present = _marks.values.where((v) => v == 'PRESENT').length;

    return DetailScaffold(
      title: 'Attendance',
      subtitle: '${widget.sectionName} · ${_dateFmt.format(DateTime.now())}',
      icon: Icons.fact_check_rounded,
      onRefresh: () async =>
          ref.invalidate(sectionStudentsProvider((sectionId: widget.sectionId, date: _date))),
      hero: students.isEmpty
          ? null
          : Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('MARKED PRESENT', style: eyebrow(Colors.white.withValues(alpha: 0.85))),
                      const SizedBox(height: 6),
                      Text('$present / ${students.length}',
                          style: const TextStyle(
                              color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800, height: 1)),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() {
                    for (final s in students) {
                      _marks[s['id'] as String] = 'PRESENT';
                    }
                  }),
                  style: TextButton.styleFrom(
                    backgroundColor: Colors.white.withValues(alpha: 0.18),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
                  ),
                  child: const Text('All present', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ],
            ),
      children: [
        if (async.isLoading)
          const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
        else if (students.isEmpty)
          const _Empty('No students enrolled in this class yet.')
        else ...[
          const SectionLabel('Students'),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(
              children: [
                for (var i = 0; i < students.length; i++) ...[
                  _StudentRow(
                    name: students[i]['name'] as String,
                    roll: '${students[i]['rollNumber']}',
                    status: _marks[students[i]['id']] ?? 'PRESENT',
                    onPick: (st) => setState(() => _marks[students[i]['id'] as String] = st),
                  ),
                  if (i < students.length - 1) const Hairline(),
                ],
              ],
            ),
          ),
          const SizedBox(height: 22),
          PrimaryButton(
            label: _saving ? 'Saving…' : 'Save attendance',
            icon: Icons.check_rounded,
            onPressed: _saving ? null : () => _submit(students),
          ),
        ],
      ],
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({required this.name, required this.roll, required this.status, required this.onPick});
  final String name;
  final String roll;
  final String status;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: AppColors.surfaceSunken, borderRadius: BorderRadius.circular(10)),
            child: Text(roll.isEmpty ? '–' : roll,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(name,
                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 8),
          for (final (code, letter, color) in _statuses)
            GestureDetector(
              onTap: () => onPick(code),
              child: Container(
                margin: const EdgeInsets.only(left: 6),
                width: 32,
                height: 32,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: status == code ? color : color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(letter,
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: status == code ? Colors.white : color)),
              ),
            ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Center(
            child: Text(text, style: const TextStyle(color: AppColors.muted))),
      );
}
