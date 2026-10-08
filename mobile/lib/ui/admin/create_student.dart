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
  final _middle = TextEditingController();
  final _last = TextEditingController();
  final _dob = TextEditingController();
  final _blood = TextEditingController();
  final _category = TextEditingController();
  final _roll = TextEditingController();
  final _addr = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _postal = TextEditingController();
  final _prevSchool = TextEditingController();
  final _gName = TextEditingController();
  final _gPhone = TextEditingController();
  final _gEmail = TextEditingController();
  final _gOcc = TextEditingController();
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
    String t(TextEditingController c) => c.text.trim();
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/students', {
      'firstName': t(_first),
      if (t(_middle).isNotEmpty) 'middleName': t(_middle),
      'lastName': t(_last),
      if (_gender != null) 'gender': _gender,
      if (t(_dob).isNotEmpty) 'dateOfBirth': t(_dob),
      if (t(_blood).isNotEmpty) 'bloodGroup': t(_blood),
      if (t(_category).isNotEmpty) 'category': t(_category),
      if (t(_roll).isNotEmpty) 'rollNumber': t(_roll),
      if (t(_addr).isNotEmpty) 'addressLine1': t(_addr),
      if (t(_city).isNotEmpty) 'city': t(_city),
      if (t(_state).isNotEmpty) 'state': t(_state),
      if (t(_postal).isNotEmpty) 'postalCode': t(_postal),
      if (t(_prevSchool).isNotEmpty) 'previousSchool': t(_prevSchool),
      'sectionId': _sectionId,
      'guardianName': t(_gName),
      'guardianPhone': t(_gPhone),
      if (t(_gEmail).isNotEmpty) 'guardianEmail': t(_gEmail),
      if (t(_gOcc).isNotEmpty) 'guardianOccupation': t(_gOcc),
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
            Expanded(child: AppTextField(controller: _middle, label: 'Middle')),
          ],
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _last, label: 'Last name'),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: AppDropdown<String>(
            label: 'Gender',
            value: _gender,
            items: const ['MALE', 'FEMALE', 'OTHER'],
            itemLabel: (g) => g[0] + g.substring(1).toLowerCase(),
            onChanged: (v) => setState(() => _gender = v),
          )),
          const SizedBox(width: 12),
          Expanded(child: _DateField(controller: _dob, label: 'Date of birth')),
        ]),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: AppTextField(controller: _blood, label: 'Blood group', hint: 'e.g. O+')),
          const SizedBox(width: 12),
          Expanded(child: AppTextField(controller: _category, label: 'Category', hint: 'e.g. General')),
        ]),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: AppTextField(controller: _roll, label: 'Roll number', hint: 'Optional')),
          const SizedBox(width: 12),
          Expanded(child: AppDropdown<String>(
            label: 'Class',
            required: true,
            value: _sectionId,
            items: sections.map((s) => s['id'] as String).toList(),
            itemLabel: (id) {
              final s = sections.firstWhere((e) => e['id'] == id, orElse: () => {});
              return '${s['name'] ?? id} · ${s['seatsLeft'] ?? 0} seats';
            },
            onChanged: (v) => setState(() => _sectionId = v),
          )),
        ]),
        const SizedBox(height: 22),
        const SectionLabel('Address & background'),
        AppTextField(controller: _addr, label: 'Address', hint: 'Optional'),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: AppTextField(controller: _city, label: 'City')),
          const SizedBox(width: 12),
          Expanded(child: AppTextField(controller: _state, label: 'State')),
          const SizedBox(width: 12),
          SizedBox(width: 100, child: AppTextField(controller: _postal, label: 'PIN', keyboard: TextInputType.number)),
        ]),
        const SizedBox(height: 16),
        AppTextField(controller: _prevSchool, label: 'Previous school', hint: 'Optional'),
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
        const SizedBox(height: 16),
        AppTextField(controller: _gOcc, label: 'Guardian occupation', hint: 'Optional'),
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
    for (final c in [_first, _middle, _last, _dob, _blood, _category, _roll, _addr, _city, _state,
        _postal, _prevSchool, _gName, _gPhone, _gEmail, _gOcc]) {
      c.dispose();
    }
    super.dispose();
  }
}

/// A read-only text field that opens a date picker and writes YYYY-MM-DD.
class _DateField extends StatelessWidget {
  const _DateField({required this.controller, required this.label});
  final TextEditingController controller;
  final String label;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () async {
        final now = DateTime.now();
        final picked = await showDatePicker(
          context: context,
          initialDate: DateTime(now.year - 6),
          firstDate: DateTime(now.year - 30),
          lastDate: now,
        );
        if (picked != null) {
          controller.text = '${picked.year.toString().padLeft(4, '0')}-'
              '${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
        }
      },
      child: AbsorbPointer(
        child: AppTextField(controller: controller, label: label, hint: 'YYYY-MM-DD'),
      ),
    );
  }
}
