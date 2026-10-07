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
  String _staffType = 'TEACHING';
  String? _roleKey;
  bool _saving = false;

  Future<void> _submit() async {
    if (_first.text.trim().isEmpty || !_email.text.contains('@') || _roleKey == null) {
      showToast(context, 'Name, a valid email and a role are required.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/staff', {
      'firstName': _first.text.trim(),
      'lastName': _last.text.trim(),
      'email': _email.text.trim(),
      'phone': _phone.text.trim(),
      'staffType': _staffType,
      'roleKey': _roleKey,
      if (_qualification.text.trim().isNotEmpty) 'qualification': _qualification.text.trim(),
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
        const SizedBox(height: 16),
        AppTextField(controller: _qualification, label: 'Qualification', hint: 'Optional'),
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
    _first.dispose();
    _last.dispose();
    _email.dispose();
    _phone.dispose();
    _qualification.dispose();
    super.dispose();
  }
}
