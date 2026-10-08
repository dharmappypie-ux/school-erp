import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

class CreateStaffScreen extends ConsumerStatefulWidget {
  const CreateStaffScreen({super.key});
  @override
  ConsumerState<CreateStaffScreen> createState() => _CreateStaffScreenState();
}

class _CreateStaffScreenState extends ConsumerState<CreateStaffScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _qualification = TextEditingController();
  final _dob = TextEditingController();
  final _blood = TextEditingController();
  final _spec = TextEditingController();
  final _exp = TextEditingController();
  final _addr = TextEditingController();
  final _city = TextEditingController();
  final _joining = TextEditingController();
  String _staffType = 'TEACHING';
  String? _roleKey;
  Map<String, dynamic>? _dept;
  Map<String, dynamic>? _desig;
  bool _saving = false;

  Future<void> _submit() async {
    if (_first.text.trim().isEmpty || !_email.text.contains('@') || _roleKey == null) {
      showToast(context, 'Name, a valid email and a role are required.', error: true);
      return;
    }
    setState(() => _saving = true);
    String t(TextEditingController c) => c.text.trim();
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/staff', {
      'firstName': t(_first),
      'lastName': t(_last),
      'email': t(_email),
      'phone': t(_phone),
      'staffType': _staffType,
      'roleKey': _roleKey,
      if (t(_qualification).isNotEmpty) 'qualification': t(_qualification),
      if (t(_dob).isNotEmpty) 'dateOfBirth': t(_dob),
      if (t(_joining).isNotEmpty) 'joiningDate': t(_joining),
      if (t(_blood).isNotEmpty) 'bloodGroup': t(_blood),
      if (t(_spec).isNotEmpty) 'specialisation': t(_spec),
      if (t(_exp).isNotEmpty) 'experience': int.tryParse(t(_exp)) ?? 0,
      if (t(_addr).isNotEmpty) 'addressLine1': t(_addr),
      if (t(_city).isNotEmpty) 'city': t(_city),
      if (_dept != null) 'departmentId': _dept!['id'],
      if (_desig != null) 'designationId': _desig!['id'],
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Staff added.' : 'Could not add.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminStaffProvider);
      ref.invalidate(adminOverviewProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final meta = ref.watch(adminMetaProvider);
    final staffData = ref.watch(adminStaffProvider);
    final departments = (staffData.value?['departments'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final designations = (staffData.value?['designations'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final roles = (meta.value?['roles'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final staffTypes = (meta.value?['staffTypes'] as List?)?.cast<String>() ??
        const ['TEACHING', 'NON_TEACHING', 'ADMINISTRATIVE', 'SUPPORT', 'MANAGEMENT'];

    String pretty(String s) =>
        s.split('_').map((w) => w[0] + w.substring(1).toLowerCase()).join(' ');

    return DetailScaffold(
      title: 'Add staff',
      subtitle: 'Creates the member and their login',
      icon: Icons.badge_rounded,
      children: [
        if (meta.isLoading)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: AppCard(
              child: Row(children: [
                SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                SizedBox(width: 12),
                Text('Loading roles…', style: TextStyle(color: AppColors.muted)),
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
                const Expanded(child: Text("Couldn't load roles — check your connection.",
                    style: TextStyle(color: AppColors.muted))),
                TextButton(onPressed: () => ref.invalidate(adminMetaProvider), child: const Text('Retry')),
              ]),
            ),
          ),
        const SectionLabel('Personal'),
        Row(
          children: [
            Expanded(child: AppTextField(controller: _first, label: 'First name', required: true)),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _last, label: 'Last name')),
          ],
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _email, label: 'Email', hint: 'Used for their login', keyboard: TextInputType.emailAddress, required: true),
        const SizedBox(height: 16),
        AppTextField(controller: _phone, label: 'Phone', keyboard: TextInputType.phone),
        const SizedBox(height: 22),
        const SectionLabel('Role'),
        AppDropdown<String>(
          label: 'Staff type',
          required: true,
          value: _staffType,
          items: staffTypes,
          itemLabel: pretty,
          onChanged: (v) => setState(() => _staffType = v ?? 'TEACHING'),
        ),
        const SizedBox(height: 16),
        AppDropdown<String>(
          label: 'System role',
          required: true,
          value: _roleKey,
          items: roles.map((r) => r['key'] as String).toList(),
          itemLabel: (k) =>
              (roles.firstWhere((r) => r['key'] == k, orElse: () => {})['name'] ?? k).toString(),
          onChanged: (v) => setState(() => _roleKey = v),
        ),
        if (departments.isNotEmpty) ...[
          const SizedBox(height: 16),
          AppDropdown<Map<String, dynamic>>(label: 'Department (optional)', value: _dept, items: departments,
              itemLabel: (d) => d['name']?.toString() ?? '', onChanged: (d) => setState(() => _dept = d)),
        ],
        if (designations.isNotEmpty) ...[
          const SizedBox(height: 16),
          AppDropdown<Map<String, dynamic>>(label: 'Designation (optional)', value: _desig, items: designations,
              itemLabel: (d) => d['name']?.toString() ?? '', onChanged: (d) => setState(() => _desig = d)),
        ],
        const SizedBox(height: 22),
        const SectionLabel('Profile'),
        AppTextField(controller: _qualification, label: 'Qualification', hint: 'Optional'),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: AppTextField(controller: _spec, label: 'Specialisation', hint: 'Optional')),
          const SizedBox(width: 12),
          SizedBox(width: 110, child: AppTextField(controller: _exp, label: 'Experience (yrs)', keyboard: TextInputType.number)),
        ]),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: AppTextField(controller: _dob, label: 'Date of birth', hint: 'YYYY-MM-DD')),
          const SizedBox(width: 12),
          Expanded(child: AppTextField(controller: _blood, label: 'Blood group')),
        ]),
        const SizedBox(height: 16),
        AppTextField(controller: _joining, label: 'Joining date', hint: 'YYYY-MM-DD (today if blank)'),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: AppTextField(controller: _addr, label: 'Address', hint: 'Optional')),
          const SizedBox(width: 12),
          Expanded(child: AppTextField(controller: _city, label: 'City')),
        ]),
        const SizedBox(height: 26),
        PrimaryButton(
          label: _saving ? 'Adding…' : 'Add staff member',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _submit,
        ),
        const SizedBox(height: 10),
        const Center(
          child: Text('An employee ID and temporary password are generated.',
              style: TextStyle(fontSize: 12, color: AppColors.faint)),
        ),
      ],
    );
  }

  @override
  void dispose() {
    for (final c in [_first, _last, _email, _phone, _qualification, _dob, _blood, _spec, _exp, _addr, _city, _joining]) {
      c.dispose();
    }
    super.dispose();
  }
}
