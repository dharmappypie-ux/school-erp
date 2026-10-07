import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _dateFmt = DateFormat('EEE, d MMM yyyy');

class SetHomeworkScreen extends ConsumerStatefulWidget {
  const SetHomeworkScreen({super.key, this.initialSectionId});
  final String? initialSectionId;

  @override
  ConsumerState<SetHomeworkScreen> createState() => _SetHomeworkScreenState();
}

class _SetHomeworkScreenState extends ConsumerState<SetHomeworkScreen> {
  String? _sectionId;
  String? _subjectId;
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _maxMarks = TextEditingController();
  DateTime _due = DateTime.now().add(const Duration(days: 2));
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _sectionId = widget.initialSectionId;
  }

  Future<void> _pickDue() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _due,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 180)),
    );
    if (picked != null) setState(() => _due = picked);
  }

  Future<void> _submit() async {
    if (_sectionId == null || _subjectId == null || _title.text.trim().length < 3) {
      showToast(context, 'Pick a class, a subject and a title.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/teacher/homework', {
      'sectionId': _sectionId,
      'subjectId': _subjectId,
      'title': _title.text.trim(),
      'description': _desc.text.trim(),
      'dueOn': _due.toIso8601String(),
      if (_maxMarks.text.trim().isNotEmpty) 'maxMarks': _maxMarks.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Assignment set.' : 'Could not set.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(teacherOverviewProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final classes = ref.watch(teacherClassesProvider);
    final sections = (classes.value?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final subjects = (classes.value?['subjects'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Set homework',
      subtitle: 'Assign work to a whole class',
      icon: Icons.assignment_add,
      children: [
        if (classes.isLoading)
          const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
        else ...[
          AppDropdown<String>(
            label: 'Class',
            required: true,
            value: _sectionId,
            items: sections.map((s) => s['id'] as String).toList(),
            itemLabel: (id) =>
                (sections.firstWhere((s) => s['id'] == id, orElse: () => {})['name'] ?? id).toString(),
            onChanged: (v) => setState(() => _sectionId = v),
          ),
          const SizedBox(height: 16),
          AppDropdown<String>(
            label: 'Subject',
            required: true,
            value: _subjectId,
            items: subjects.map((s) => s['id'] as String).toList(),
            itemLabel: (id) =>
                (subjects.firstWhere((s) => s['id'] == id, orElse: () => {})['name'] ?? id).toString(),
            onChanged: (v) => setState(() => _subjectId = v),
          ),
          const SizedBox(height: 16),
          AppTextField(controller: _title, label: 'Title', hint: 'e.g. Exercise 7.2 — fractions', required: true),
          const SizedBox(height: 16),
          AppTextField(controller: _desc, label: 'Instructions', hint: 'Optional details for students', maxLines: 4),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('DUE DATE', style: eyebrow(AppColors.muted)),
                    const SizedBox(height: 7),
                    InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: _pickDue,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
                        decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: kCardShadow),
                        child: Row(
                          children: [
                            const Icon(Icons.event_rounded, size: 18, color: AppColors.primary),
                            const SizedBox(width: 10),
                            Text(_dateFmt.format(_due),
                                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              SizedBox(
                width: 110,
                child: AppTextField(
                    controller: _maxMarks, label: 'Max marks', hint: '—', keyboard: TextInputType.number),
              ),
            ],
          ),
          const SizedBox(height: 26),
          PrimaryButton(
            label: _saving ? 'Setting…' : 'Set assignment',
            icon: Icons.send_rounded,
            onPressed: _saving ? null : _submit,
          ),
        ],
      ],
    );
  }

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    _maxMarks.dispose();
    super.dispose();
  }
}
