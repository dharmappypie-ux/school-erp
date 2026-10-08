import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Curriculum editor: map subjects onto a class (teacher, weekly periods,
/// max/pass marks). Weekly periods = 0 removes the subject. Mirror of the web
/// academics curriculum editor.
class AdminCurriculumScreen extends ConsumerStatefulWidget {
  const AdminCurriculumScreen({super.key});
  @override
  ConsumerState<AdminCurriculumScreen> createState() => _S();
}

class _S extends ConsumerState<AdminCurriculumScreen> {
  String? _classLevelId;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(adminCurriculumProvider(_classLevelId));
    final d = async.value;
    final classLevels = (d?['classLevels'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final subjects = (d?['subjects'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final teachers = (d?['teachers'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final mappings = (d?['mappings'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = d?['canManage'] == true;

    return DetailScaffold(
      title: 'Curriculum',
      subtitle: 'Map subjects onto classes',
      icon: Icons.menu_book_rounded,
      onRefresh: () async => ref.invalidate(adminCurriculumProvider(_classLevelId)),
      children: [
        if (async.isLoading && d == null)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (d == null)
          const AppCard(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted)))
        else ...[
          AppDropdown<Map<String, dynamic>>(
            label: 'Class',
            value: classLevels.where((c) => c['id'] == _classLevelId).cast<Map<String, dynamic>?>().firstWhere((_) => true, orElse: () => null),
            items: classLevels,
            itemLabel: (c) => c['name']?.toString() ?? '',
            onChanged: (c) => setState(() => _classLevelId = c?['id']?.toString()),
          ),
          const SizedBox(height: 18),
          if (_classLevelId == null)
            const AppCard(child: Text('Choose a class to see and edit its subjects.', style: TextStyle(color: AppColors.muted)))
          else ...[
            Row(children: [
              const Expanded(child: SectionLabel('Subjects on this class')),
              if (canManage)
                TextButton.icon(
                  onPressed: () => _openForm(context, subjects, teachers, null),
                  icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Add'),
                ),
            ]),
            if (mappings.isEmpty)
              const AppCard(child: Text('No subjects mapped yet.', style: TextStyle(color: AppColors.muted)))
            else
              for (final m in mappings)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: AppCard(
                    onTap: canManage ? () => _openForm(context, subjects, teachers, m) : null,
                    child: Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(m['subject']?.toString() ?? '', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 2),
                        Text('${m['weeklyPeriods']} periods/wk · ${m['teacher'] ?? 'No teacher'} · max ${m['maxMarks'] ?? '—'}, pass ${m['passMarks'] ?? '—'}',
                            style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                      ])),
                      if (canManage) const Icon(Icons.edit_rounded, size: 16, color: AppColors.faint),
                    ]),
                  ),
                ),
          ],
        ],
      ],
    );
  }

  void _openForm(BuildContext context, List<Map<String, dynamic>> subjects, List<Map<String, dynamic>> teachers, Map<String, dynamic>? existing) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => _AssignForm(
        classLevelId: _classLevelId!,
        subjects: subjects,
        teachers: teachers,
        existing: existing,
      ),
    )).then((_) => ref.invalidate(adminCurriculumProvider(_classLevelId)));
  }
}

class _AssignForm extends ConsumerStatefulWidget {
  const _AssignForm({required this.classLevelId, required this.subjects, required this.teachers, this.existing});
  final String classLevelId;
  final List<Map<String, dynamic>> subjects;
  final List<Map<String, dynamic>> teachers;
  final Map<String, dynamic>? existing;
  @override
  ConsumerState<_AssignForm> createState() => _AssignFormState();
}

class _AssignFormState extends ConsumerState<_AssignForm> {
  String? _subjectId;
  String? _teacherId;
  late final TextEditingController _periods;
  late final TextEditingController _max;
  late final TextEditingController _pass;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _subjectId = e?['subjectId']?.toString();
    _teacherId = e?['teacherId']?.toString();
    _periods = TextEditingController(text: (e?['weeklyPeriods'] ?? 5).toString());
    _max = TextEditingController(text: (e?['maxMarks'] ?? 100).toString());
    _pass = TextEditingController(text: (e?['passMarks'] ?? 35).toString());
  }

  Future<void> _save() async {
    if (_subjectId == null) { showToast(context, 'Choose a subject.', error: true); return; }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/curriculum/assign', {
      'classLevelId': widget.classLevelId,
      'subjectId': _subjectId,
      if (_teacherId != null) 'teacherId': _teacherId,
      'weeklyPeriods': int.tryParse(_periods.text.trim()) ?? 0,
      'maxMarks': int.tryParse(_max.text.trim()) ?? 100,
      'passMarks': int.tryParse(_pass.text.trim()) ?? 35,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.existing != null;
    return DetailScaffold(
      title: editing ? 'Edit subject' : 'Add subject',
      subtitle: 'Subject on this class',
      icon: Icons.menu_book_rounded,
      children: [
        AppDropdown<Map<String, dynamic>>(
          label: 'Subject', required: true,
          value: widget.subjects.where((s) => s['id'] == _subjectId).cast<Map<String, dynamic>?>().firstWhere((_) => true, orElse: () => null),
          items: widget.subjects,
          itemLabel: (s) => s['name']?.toString() ?? '',
          onChanged: editing ? (_) {} : (s) => setState(() => _subjectId = s?['id']?.toString()),
        ),
        const SizedBox(height: 14),
        AppDropdown<Map<String, dynamic>>(
          label: 'Teacher (optional)',
          value: widget.teachers.where((t) => t['id'] == _teacherId).cast<Map<String, dynamic>?>().firstWhere((_) => true, orElse: () => null),
          items: widget.teachers,
          itemLabel: (t) => t['name']?.toString() ?? '',
          onChanged: (t) => setState(() => _teacherId = t?['id']?.toString()),
        ),
        const SizedBox(height: 14),
        AppTextField(controller: _periods, label: 'Weekly periods (0 removes it)', keyboard: TextInputType.number),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: AppTextField(controller: _max, label: 'Max marks', keyboard: TextInputType.number)),
          const SizedBox(width: 12),
          Expanded(child: AppTextField(controller: _pass, label: 'Pass marks', keyboard: TextInputType.number)),
        ]),
        const SizedBox(height: 22),
        PrimaryButton(label: _saving ? 'Saving…' : 'Save', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
      ],
    );
  }

  @override
  void dispose() { _periods.dispose(); _max.dispose(); _pass.dispose(); super.dispose(); }
}
