import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Admin exam setup: create exam terms and exam papers (term × class × subject).
/// Mirror of the web exams setup panels.
class AdminExamSetupScreen extends ConsumerWidget {
  const AdminExamSetupScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminExamSetupProvider);
    final d = async.value;
    final terms = (d?['terms'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final classLevels = (d?['classLevels'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final subjects = (d?['subjects'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = d?['canManage'] == true;

    return DetailScaffold(
      title: 'Exam setup',
      subtitle: '${terms.length} terms',
      icon: Icons.assignment_turned_in_rounded,
      onRefresh: () async => ref.invalidate(adminExamSetupProvider),
      children: [
        if (async.isLoading && d == null)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (d == null)
          const AppCard(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted)))
        else ...[
          if (canManage) ...[
            Row(children: [
              Expanded(child: PrimaryButton(
                label: 'New term', icon: Icons.add_rounded,
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _TermForm())),
              )),
              const SizedBox(width: 12),
              Expanded(child: PrimaryButton(
                label: 'New exam', icon: Icons.note_add_rounded,
                onPressed: terms.isEmpty ? null : () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => _ExamForm(terms: terms, classLevels: classLevels, subjects: subjects))),
              )),
            ]),
            if (terms.isEmpty)
              const Padding(padding: EdgeInsets.only(top: 8),
                  child: Text('Create a term first, then add exam papers to it.',
                      style: TextStyle(fontSize: 12, color: AppColors.faint))),
            const SizedBox(height: 18),
          ],
          const SectionLabel('Terms'),
          if (terms.isEmpty)
            const AppCard(child: Text('No exam terms yet.', style: TextStyle(color: AppColors.muted)))
          else
            for (final t in terms)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(child: Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(t['name']?.toString() ?? '', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text('Sequence ${t['sequence']} · weight ${t['weightage'] ?? 0}% · ${t['exams']} exams',
                        style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                  ])),
                ])),
              ),
        ],
      ],
    );
  }
}

class _TermForm extends ConsumerStatefulWidget {
  const _TermForm();
  @override
  ConsumerState<_TermForm> createState() => _TermFormState();
}

class _TermFormState extends ConsumerState<_TermForm> {
  final _name = TextEditingController();
  final _seq = TextEditingController(text: '1');
  final _weight = TextEditingController(text: '0');
  bool _saving = false;

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) { showToast(context, 'Enter a term name.', error: true); return; }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/exams/term', {
      'name': _name.text.trim(),
      'sequence': int.tryParse(_seq.text.trim()) ?? 1,
      'weightage': num.tryParse(_weight.text.trim()) ?? 0,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminExamSetupProvider); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'New exam term', subtitle: 'For the current year', icon: Icons.add_rounded,
        children: [
          AppTextField(controller: _name, label: 'Term name', hint: 'e.g. Term 1', required: true),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: AppTextField(controller: _seq, label: 'Sequence', keyboard: TextInputType.number)),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _weight, label: 'Weightage %', keyboard: TextInputType.number)),
          ]),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Creating…' : 'Create term', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() { _name.dispose(); _seq.dispose(); _weight.dispose(); super.dispose(); }
}

class _ExamForm extends ConsumerStatefulWidget {
  const _ExamForm({required this.terms, required this.classLevels, required this.subjects});
  final List<Map<String, dynamic>> terms;
  final List<Map<String, dynamic>> classLevels;
  final List<Map<String, dynamic>> subjects;
  @override
  ConsumerState<_ExamForm> createState() => _ExamFormState();
}

class _ExamFormState extends ConsumerState<_ExamForm> {
  Map<String, dynamic>? _term;
  Map<String, dynamic>? _class;
  Map<String, dynamic>? _subject;
  final _name = TextEditingController(text: 'Final');
  final _max = TextEditingController(text: '100');
  final _pass = TextEditingController(text: '35');
  bool _saving = false;

  Future<void> _save() async {
    if (_term == null || _class == null || _subject == null) {
      showToast(context, 'Choose term, class and subject.', error: true); return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/exams', {
      'termId': _term!['id'],
      'classLevelId': _class!['id'],
      'subjectId': _subject!['id'],
      'name': _name.text.trim(),
      'maxMarks': int.tryParse(_max.text.trim()) ?? 100,
      'passMarks': int.tryParse(_pass.text.trim()) ?? 35,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminExamSetupProvider); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'New exam paper', subtitle: 'Term × class × subject', icon: Icons.note_add_rounded,
        children: [
          AppDropdown<Map<String, dynamic>>(label: 'Term', required: true, value: _term, items: widget.terms,
              itemLabel: (t) => t['name']?.toString() ?? '', onChanged: (t) => setState(() => _term = t)),
          const SizedBox(height: 14),
          AppDropdown<Map<String, dynamic>>(label: 'Class', required: true, value: _class, items: widget.classLevels,
              itemLabel: (c) => c['name']?.toString() ?? '', onChanged: (c) => setState(() => _class = c)),
          const SizedBox(height: 14),
          AppDropdown<Map<String, dynamic>>(label: 'Subject', required: true, value: _subject, items: widget.subjects,
              itemLabel: (s) => s['name']?.toString() ?? '', onChanged: (s) => setState(() => _subject = s)),
          const SizedBox(height: 14),
          AppTextField(controller: _name, label: 'Exam name', hint: 'e.g. Final, Unit Test 1', required: true),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: AppTextField(controller: _max, label: 'Max marks', keyboard: TextInputType.number)),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _pass, label: 'Pass marks', keyboard: TextInputType.number)),
          ]),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Creating…' : 'Create exam', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() { _name.dispose(); _max.dispose(); _pass.dispose(); super.dispose(); }
}
