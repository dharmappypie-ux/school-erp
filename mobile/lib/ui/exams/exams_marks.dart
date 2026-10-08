import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../admin/admin_exam_setup.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

({Color c, Color bg, String label}) _examStatus(String s) => switch (s) {
      'PUBLISHED' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Published'),
      'RESULTS' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Results'),
      'MARKS_ENTRY' => (c: AppColors.primary, bg: AppColors.accentSoft, label: 'Marks entry'),
      'ONGOING' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Ongoing'),
      _ => (c: AppColors.muted, bg: AppColors.line, label: 'Planned'),
    };

/// Exams list → pick an exam → pick a section → enter marks.
class ExamsScreen extends ConsumerWidget {
  const ExamsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(teacherExamsProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final offline = !async.isLoading && async.value == null;
    // Admins/principals (exams.manage) get a shortcut to create terms + papers.
    final canSetup = ref.watch(adminExamSetupProvider).value?['canManage'] == true;

    return DetailScaffold(
      title: 'Examinations',
      subtitle: offline ? 'Not loaded' : '${items.length} exams',
      icon: Icons.assignment_turned_in_rounded,
      onRefresh: () async => ref.invalidate(teacherExamsProvider),
      children: [
        if (canSetup) ...[
          AppCard(
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AdminExamSetupScreen())),
            child: Row(children: const [
              Icon(Icons.assignment_turned_in_rounded, color: AppColors.primary),
              SizedBox(width: 12),
              Expanded(child: Text('Set up exams — terms & papers', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700))),
              Icon(Icons.chevron_right_rounded, color: AppColors.faint),
            ]),
          ),
          const SizedBox(height: 14),
        ],
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.",
                style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Row(children: [
            Icon(Icons.inbox_rounded, color: AppColors.faint), SizedBox(width: 12),
            Expanded(child: Text('No exams scheduled.', style: TextStyle(color: AppColors.muted))),
          ]))
        else
          for (final e in items) ...[
            _ExamRow(e: e),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _ExamRow extends StatelessWidget {
  const _ExamRow({required this.e});
  final Map<String, dynamic> e;
  @override
  Widget build(BuildContext context) {
    final st = _examStatus((e['status'] as String?) ?? '');
    final sections = (e['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    return AppCard(
      onTap: sections.isEmpty
          ? null
          : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => MarksEntryScreen(exam: e))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(e['name']?.toString() ?? '',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
            StatusChip(label: st.label, color: st.c, bg: st.bg),
          ]),
          const SizedBox(height: 4),
          Text('${e['subject'] ?? ''} · ${e['className'] ?? ''} · ${e['term'] ?? ''} · out of ${e['maxMarks'] ?? ''}',
              style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          if (sections.isEmpty) ...[
            const SizedBox(height: 6),
            const Text('No sections for this class yet.',
                style: TextStyle(fontSize: 12, color: AppColors.faint)),
          ],
        ],
      ),
    );
  }
}

/// Pick a section, then enter a mark (or mark absent) per student.
class MarksEntryScreen extends ConsumerStatefulWidget {
  const MarksEntryScreen({super.key, required this.exam});
  final Map<String, dynamic> exam;
  @override
  ConsumerState<MarksEntryScreen> createState() => _MarksEntryScreenState();
}

class _MarksEntryScreenState extends ConsumerState<MarksEntryScreen> {
  String? _sectionId;
  final _marks = <String, TextEditingController>{};
  final _absent = <String, bool>{};
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final sections = (widget.exam['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    if (sections.length == 1) _sectionId = sections.first['id'] as String?;
  }

  TextEditingController _ctl(String id, num? seed) =>
      _marks.putIfAbsent(id, () => TextEditingController(text: seed?.toString() ?? ''));

  Future<void> _save(List<Map<String, dynamic>> students) async {
    setState(() => _saving = true);
    final entries = students.map((s) {
      final id = s['id'] as String;
      return {
        'studentId': id,
        'marks': _marks[id]?.text ?? '',
        'isAbsent': _absent[id] ?? false,
      };
    }).toList();
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/teacher/exams/marks', {
      'examId': widget.exam['id'],
      'sectionId': _sectionId,
      'entries': entries,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Saved.' : 'Could not save.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(examRosterProvider((examId: widget.exam['id'] as String, sectionId: _sectionId!)));
  }

  @override
  Widget build(BuildContext context) {
    final sections = (widget.exam['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final maxMarks = widget.exam['maxMarks'];
    final roster = _sectionId == null
        ? null
        : ref.watch(examRosterProvider((examId: widget.exam['id'] as String, sectionId: _sectionId!)));
    final students = (roster?.value?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: widget.exam['name']?.toString() ?? 'Marks',
      subtitle: '${widget.exam['subject'] ?? ''} · out of $maxMarks',
      icon: Icons.grading_rounded,
      children: [
        const SectionLabel('Section'),
        AppDropdown<String>(
          label: 'Class section',
          value: _sectionId,
          items: sections.map((s) => s['id'] as String).toList(),
          itemLabel: (id) =>
              (sections.firstWhere((s) => s['id'] == id, orElse: () => const {})['name'] as String?) ?? id,
          onChanged: (v) => setState(() => _sectionId = v),
        ),
        const SizedBox(height: 18),
        if (_sectionId == null)
          const AppCard(child: Text('Pick a section to load its roster.',
              style: TextStyle(color: AppColors.muted)))
        else if (roster!.isLoading)
          const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
        else if (students.isEmpty)
          const AppCard(child: Text('No students enrolled in this section.',
              style: TextStyle(color: AppColors.muted)))
        else ...[
          const SectionLabel('Enter marks'),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Column(children: [
              for (var i = 0; i < students.length; i++) ...[
                _MarkRow(
                  s: students[i],
                  controller: _ctl(students[i]['id'] as String, students[i]['marks'] as num?),
                  absent: _absent[students[i]['id']] ?? (students[i]['isAbsent'] == true),
                  onAbsent: (v) => setState(() => _absent[students[i]['id'] as String] = v),
                ),
                if (i < students.length - 1) const Hairline(),
              ],
            ]),
          ),
          const SizedBox(height: 20),
          PrimaryButton(
            label: _saving ? 'Saving…' : 'Save marks',
            icon: Icons.check_rounded,
            onPressed: _saving ? null : () => _save(students),
          ),
        ],
      ],
    );
  }

  @override
  void dispose() {
    for (final c in _marks.values) {
      c.dispose();
    }
    super.dispose();
  }
}

class _MarkRow extends StatefulWidget {
  const _MarkRow({required this.s, required this.controller, required this.absent, required this.onAbsent});
  final Map<String, dynamic> s;
  final TextEditingController controller;
  final bool absent;
  final ValueChanged<bool> onAbsent;
  @override
  State<_MarkRow> createState() => _MarkRowState();
}

class _MarkRowState extends State<_MarkRow> {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 30,
            child: Text('${widget.s['rollNumber'] ?? ''}',
                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.muted, fontSize: 12.5)),
          ),
          Expanded(
            child: Text(widget.s['name']?.toString() ?? '',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                overflow: TextOverflow.ellipsis),
          ),
          SizedBox(
            width: 66,
            child: TextField(
              controller: widget.controller,
              enabled: !widget.absent,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w700),
              decoration: InputDecoration(
                isDense: true,
                hintText: widget.absent ? '—' : 'mark',
                contentPadding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => widget.onAbsent(!widget.absent),
            child: Container(
              width: 38,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: widget.absent ? AppColors.danger : AppColors.danger.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text('Ab',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      color: widget.absent ? Colors.white : AppColors.danger)),
            ),
          ),
        ],
      ),
    );
  }
}
