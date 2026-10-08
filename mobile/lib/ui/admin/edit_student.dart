import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

const _statuses = ['ACTIVE', 'ALUMNI', 'TRANSFERRED', 'DROPPED', 'SUSPENDED', 'ON_LEAVE'];

/// Edit a student: core details + lifecycle status, and move them to another
/// class (promote). Mirrors the website's student edit + promote.
class EditStudentScreen extends ConsumerStatefulWidget {
  const EditStudentScreen({super.key, required this.studentId});
  final String studentId;
  @override
  ConsumerState<EditStudentScreen> createState() => _EditStudentScreenState();
}

class _EditStudentScreenState extends ConsumerState<EditStudentScreen> {
  final _first = TextEditingController();
  final _middle = TextEditingController();
  final _last = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _blood = TextEditingController();
  final _category = TextEditingController();
  final _roll = TextEditingController();
  final _addr = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _postal = TextEditingController();
  final _prevSchool = TextEditingController();
  final _dob = TextEditingController();
  String _status = 'ACTIVE';
  String? _gender;
  String? _moveSectionId;
  bool _loaded = false;
  bool _saving = false;

  late final _detail = ref.read(apiProvider).getJson('/api/mobile/v1/admin/student/${widget.studentId}');

  Future<void> _save() async {
    if (_first.text.trim().isEmpty) {
      showToast(context, 'First name is required.', error: true);
      return;
    }
    setState(() => _saving = true);
    String t(TextEditingController c) => c.text.trim();
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/student/${widget.studentId}', {
      'firstName': t(_first),
      if (t(_middle).isNotEmpty) 'middleName': t(_middle),
      'lastName': t(_last),
      'status': _status,
      if (_gender != null) 'gender': _gender,
      if (t(_dob).isNotEmpty) 'dateOfBirth': t(_dob),
      if (t(_phone).isNotEmpty) 'phone': t(_phone),
      if (t(_email).isNotEmpty) 'email': t(_email),
      if (t(_blood).isNotEmpty) 'bloodGroup': t(_blood),
      if (t(_category).isNotEmpty) 'category': t(_category),
      if (t(_roll).isNotEmpty) 'rollNumber': t(_roll),
      if (t(_addr).isNotEmpty) 'addressLine1': t(_addr),
      if (t(_city).isNotEmpty) 'city': t(_city),
      if (t(_state).isNotEmpty) 'state': t(_state),
      if (t(_postal).isNotEmpty) 'postalCode': t(_postal),
      if (t(_prevSchool).isNotEmpty) 'previousSchool': t(_prevSchool),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Saved.' : 'Could not save.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminStudentsProvider);
      Navigator.of(context).maybePop();
    }
  }

  Future<void> _promote() async {
    if (_moveSectionId == null) return;
    setState(() => _saving = true);
    final res = await ref.read(apiProvider)
        .postJson('/api/mobile/v1/admin/student/${widget.studentId}/promote', {'sectionId': _moveSectionId});
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Moved.' : 'Could not move.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminStudentsProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final meta = ref.watch(adminMetaProvider);
    final sections = (meta.value?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return FutureBuilder<Map<String, dynamic>?>(
      future: _detail,
      builder: (context, snap) {
        final d = snap.data;
        if (d != null && !_loaded) {
          _loaded = true;
          final e = (d['edit'] as Map?)?.cast<String, dynamic>() ?? const {};
          _first.text = (d['firstName'] as String?) ?? '';
          _middle.text = (e['middleName'] as String?) ?? '';
          _last.text = (d['lastName'] as String?) ?? '';
          _phone.text = (d['phone'] as String?) ?? '';
          _email.text = (d['email'] as String?) ?? '';
          _status = (d['status'] as String?) ?? 'ACTIVE';
          _gender = d['gender'] as String?;
          _dob.text = (e['dateOfBirth'] as String?) ?? '';
          _blood.text = (e['bloodGroup'] as String?) ?? '';
          _category.text = (e['category'] as String?) ?? '';
          _roll.text = (e['rollNumber'] as String?) ?? '';
          _addr.text = (e['addressLine1'] as String?) ?? '';
          _city.text = (e['city'] as String?) ?? '';
          _state.text = (e['state'] as String?) ?? '';
          _postal.text = (e['postalCode'] as String?) ?? '';
          _prevSchool.text = (e['previousSchool'] as String?) ?? '';
        }
        return DetailScaffold(
          title: 'Edit student',
          subtitle: d?['admissionNo']?.toString() ?? 'Update details',
          icon: Icons.manage_accounts_rounded,
          children: [
            if (snap.connectionState == ConnectionState.waiting)
              const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
            else if (d == null)
              const AppCard(child: Text("Couldn't load this student.",
                  style: TextStyle(color: AppColors.muted)))
            else ...[
              const SectionLabel('Details'),
              Row(children: [
                Expanded(child: AppTextField(controller: _first, label: 'First name', required: true)),
                const SizedBox(width: 12),
                Expanded(child: AppTextField(controller: _middle, label: 'Middle')),
              ]),
              const SizedBox(height: 16),
              AppTextField(controller: _last, label: 'Last name'),
              const SizedBox(height: 16),
              AppDropdown<String>(
                label: 'Status',
                value: _status,
                items: _statuses,
                itemLabel: (s) => s[0] + s.substring(1).toLowerCase().replaceAll('_', ' '),
                onChanged: (v) => setState(() => _status = v ?? 'ACTIVE'),
              ),
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
                Expanded(child: AppTextField(controller: _roll, label: 'Roll number')),
              ]),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(child: AppTextField(controller: _blood, label: 'Blood group')),
                const SizedBox(width: 12),
                Expanded(child: AppTextField(controller: _category, label: 'Category')),
              ]),
              const SizedBox(height: 16),
              AppTextField(controller: _dob, label: 'Date of birth', hint: 'YYYY-MM-DD'),
              const SizedBox(height: 16),
              AppTextField(controller: _phone, label: 'Phone', hint: 'Optional', keyboard: TextInputType.phone),
              const SizedBox(height: 16),
              AppTextField(controller: _email, label: 'Email', hint: 'Optional', keyboard: TextInputType.emailAddress),
              const SizedBox(height: 16),
              AppTextField(controller: _addr, label: 'Address', hint: 'Optional'),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(child: AppTextField(controller: _city, label: 'City')),
                const SizedBox(width: 12),
                Expanded(child: AppTextField(controller: _state, label: 'State')),
                const SizedBox(width: 12),
                SizedBox(width: 90, child: AppTextField(controller: _postal, label: 'PIN', keyboard: TextInputType.number)),
              ]),
              const SizedBox(height: 16),
              AppTextField(controller: _prevSchool, label: 'Previous school', hint: 'Optional'),
              const SizedBox(height: 22),
              PrimaryButton(
                label: _saving ? 'Saving…' : 'Save changes',
                icon: Icons.check_rounded,
                onPressed: _saving ? null : _save,
              ),
              const SizedBox(height: 28),
              const SectionLabel('Move to class'),
              Text('Currently ${d['className'] ?? '—'}',
                  style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
              const SizedBox(height: 10),
              AppDropdown<String>(
                label: 'New class',
                value: _moveSectionId,
                items: sections.map((s) => s['id'] as String).toList(),
                itemLabel: (id) =>
                    (sections.firstWhere((s) => s['id'] == id, orElse: () => const {})['name'] as String?) ?? id,
                onChanged: (v) => setState(() => _moveSectionId = v),
              ),
              const SizedBox(height: 14),
              PrimaryButton(
                label: 'Move student',
                icon: Icons.swap_horiz_rounded,
                onPressed: (_saving || _moveSectionId == null) ? null : _promote,
              ),
            ],
          ],
        );
      },
    );
  }

  @override
  void dispose() {
    for (final c in [_first, _middle, _last, _phone, _email, _blood, _category, _roll,
        _addr, _city, _state, _postal, _prevSchool, _dob]) {
      c.dispose();
    }
    super.dispose();
  }
}
