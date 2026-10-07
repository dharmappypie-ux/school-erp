import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

class CreateStudentScreen extends ConsumerStatefulWidget {
  const CreateStudentScreen({super.key});
  @override
  ConsumerState<CreateStudentScreen> createState() => _CreateStudentScreenState();
}

class _CreateStudentScreenState extends ConsumerState<CreateStudentScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _gName = TextEditingController();
  final _gPhone = TextEditingController();
  final _gEmail = TextEditingController();
  String? _sectionId;
  String? _gender;
  String _relationship = 'FATHER';
  bool _saving = false;

  Future<void> _submit() async {
    if (_first.text.trim().isEmpty || _sectionId == null || _gName.text.trim().isEmpty || _gPhone.text.trim().length < 6) {
      showToast(context, 'Fill the required fields (name, class, guardian).', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/students', {
      'firstName': _first.text.trim(),
      'lastName': _last.text.trim(),
      if (_gender != null) 'gender': _gender,
      'sectionId': _sectionId,
      'guardianName': _gName.text.trim(),
      'guardianPhone': _gPhone.text.trim(),
      if (_gEmail.text.trim().isNotEmpty) 'guardianEmail': _gEmail.text.trim(),
      'relationship': _relationship,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Student admitted.' : 'Could not admit.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminStudentsProvider);
      ref.invalidate(adminOverviewProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final meta = ref.watch(adminMetaProvider);
    final sections = (meta.value?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final relationships = (meta.value?['relationships'] as List?)?.cast<String>() ?? const ['FATHER', 'MOTHER', 'GUARDIAN'];

    return DetailScaffold(
      title: 'Admit student',
      subtitle: 'Creates the student, guardian & logins',
      icon: Icons.person_add_alt_1_rounded,
      children: [
        if (meta.isLoading)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: AppCard(
              child: Row(children: [
                SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                SizedBox(width: 12),
                Text('Loading classes…', style: TextStyle(color: AppColors.muted)),
              ]),
            ),
          )
        else if (meta.value == null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: AppCard(
              child: Row(children: [
                const Icon(Icons.cloud_off_rounded, color: AppColors.warn),
                const SizedBox(width: 12),
                const Expanded(child: Text("Couldn't load classes — check your connection.",
                    style: TextStyle(color: AppColors.muted))),
                TextButton(onPressed: () => ref.invalidate(adminMetaProvider), child: const Text('Retry')),
              ]),
            ),
          ),
        const SectionLabel('Student'),
        Row(
          children: [
            Expanded(child: AppTextField(controller: _first, label: 'First name', required: true)),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _last, label: 'Last name')),
          ],
        ),
        const SizedBox(height: 16),
        AppDropdown<String>(
          label: 'Gender',
          value: _gender,
          items: const ['MALE', 'FEMALE', 'OTHER'],
          itemLabel: (g) => g[0] + g.substring(1).toLowerCase(),
          onChanged: (v) => setState(() => _gender = v),
        ),
        const SizedBox(height: 16),
        AppDropdown<String>(
          label: 'Class',
          required: true,
          value: _sectionId,
          items: sections.map((s) => s['id'] as String).toList(),
          itemLabel: (id) {
            final s = sections.firstWhere((e) => e['id'] == id, orElse: () => {});
            return '${s['name'] ?? id} · ${s['seatsLeft'] ?? 0} seats';
          },
          onChanged: (v) => setState(() => _sectionId = v),
        ),
        const SizedBox(height: 22),
        const SectionLabel('Primary guardian'),
        AppTextField(controller: _gName, label: 'Guardian name', required: true),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: AppTextField(
                  controller: _gPhone, label: 'Phone', keyboard: TextInputType.phone, required: true),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 150,
              child: AppDropdown<String>(
                label: 'Relation',
                value: _relationship,
                items: relationships,
                itemLabel: (r) => r[0] + r.substring(1).toLowerCase(),
                onChanged: (v) => setState(() => _relationship = v ?? 'FATHER'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _gEmail, label: 'Guardian email', hint: 'Optional', keyboard: TextInputType.emailAddress),
        const SizedBox(height: 26),
        PrimaryButton(
          label: _saving ? 'Admitting…' : 'Admit student',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _submit,
        ),
        const SizedBox(height: 10),
        const Center(
          child: Text('A temporary password is created for both logins.',
              style: TextStyle(fontSize: 12, color: AppColors.faint)),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _gName.dispose();
    _gPhone.dispose();
    _gEmail.dispose();
    super.dispose();
  }
}
