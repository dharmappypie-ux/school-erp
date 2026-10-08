import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Creates a subject → POST /api/mobile/v1/admin/subject.
class CreateSubjectScreen extends ConsumerStatefulWidget {
  const CreateSubjectScreen({super.key});
  @override
  ConsumerState<CreateSubjectScreen> createState() => _CreateSubjectScreenState();
}

class _CreateSubjectScreenState extends ConsumerState<CreateSubjectScreen> {
  final _name = TextEditingController();
  final _code = TextEditingController();
  bool _elective = false;
  bool _coScholastic = false;
  bool _graded = true;
  bool _saving = false;

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty || _code.text.trim().isEmpty) {
      showToast(context, 'Give the subject a name and code.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/subject', {
      'name': _name.text.trim(),
      'code': _code.text.trim(),
      'isElective': _elective,
      'isCoScholastic': _coScholastic,
      'isGraded': _graded,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Subject created.' : 'Could not create.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(moduleProvider((role: 'admin', name: 'classes')));
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return DetailScaffold(
      title: 'New subject',
      subtitle: 'Adds a subject to the curriculum',
      icon: Icons.menu_book_rounded,
      children: [
        const SectionLabel('Subject'),
        AppTextField(controller: _name, label: 'Name', hint: 'e.g. Mathematics', required: true),
        const SizedBox(height: 16),
        AppTextField(controller: _code, label: 'Code', hint: 'e.g. MATH', required: true),
        const SizedBox(height: 10),
        AppCard(
          child: Column(children: [
            ToggleRow(
              title: 'Elective',
              subtitle: 'Students opt in rather than it being compulsory',
              value: _elective,
              onChanged: (v) => setState(() => _elective = v),
            ),
            const Hairline(),
            ToggleRow(
              title: 'Co-scholastic',
              subtitle: 'An activity subject (art, sport) rather than academic',
              value: _coScholastic,
              onChanged: (v) => setState(() => _coScholastic = v),
            ),
            const Hairline(),
            ToggleRow(
              title: 'Graded',
              subtitle: 'Appears with marks/grades on the report card',
              value: _graded,
              onChanged: (v) => setState(() => _graded = v),
            ),
          ]),
        ),
        const SizedBox(height: 26),
        PrimaryButton(
          label: _saving ? 'Creating…' : 'Create subject',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _submit,
        ),
      ],
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    super.dispose();
  }
}
