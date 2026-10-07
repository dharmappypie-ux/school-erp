import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

const _types = ['TEACHING', 'NON_TEACHING', 'ADMINISTRATIVE', 'SUPPORT', 'MANAGEMENT'];
const _empStatus = ['ACTIVE', 'PROBATION', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'RETIRED'];

String _pretty(String s) =>
    s[0] + s.substring(1).toLowerCase().replaceAll('_', ' ');

/// Edit a staff member: core details, type and employment status. Mirrors the
/// website's staff edit (role change is handled on web for now).
class EditStaffScreen extends ConsumerStatefulWidget {
  const EditStaffScreen({super.key, required this.staffId});
  final String staffId;
  @override
  ConsumerState<EditStaffScreen> createState() => _EditStaffScreenState();
}

class _EditStaffScreenState extends ConsumerState<EditStaffScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  String _type = 'TEACHING';
  String _status = 'ACTIVE';
  bool _loaded = false;
  bool _saving = false;

  late final _detail = ref.read(apiProvider).getJson('/api/mobile/v1/admin/staff/${widget.staffId}');

  Future<void> _save() async {
    if (_first.text.trim().isEmpty || _email.text.trim().isEmpty) {
      showToast(context, 'Name and email are required.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/staff/${widget.staffId}', {
      'firstName': _first.text.trim(),
      'lastName': _last.text.trim(),
      'email': _email.text.trim(),
      'staffType': _type,
      'employmentStatus': _status,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Saved.' : 'Could not save.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminStaffProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>?>(
      future: _detail,
      builder: (context, snap) {
        final d = snap.data;
        if (d != null && !_loaded) {
          _loaded = true;
          _first.text = (d['firstName'] as String?) ?? '';
          _last.text = (d['lastName'] as String?) ?? '';
          _email.text = (d['email'] as String?) ?? '';
          _type = (d['staffType'] as String?) ?? 'TEACHING';
          _status = (d['employmentStatus'] as String?) ?? 'ACTIVE';
        }
        return DetailScaffold(
          title: 'Edit staff',
          subtitle: d?['employeeId']?.toString() ?? 'Update details',
          icon: Icons.badge_rounded,
          children: [
            if (snap.connectionState == ConnectionState.waiting)
              const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
            else if (d == null)
              const AppCard(child: Text("Couldn't load this staff member.",
                  style: TextStyle(color: AppColors.muted)))
            else ...[
              const SectionLabel('Details'),
              Row(children: [
                Expanded(child: AppTextField(controller: _first, label: 'First name', required: true)),
                const SizedBox(width: 12),
                Expanded(child: AppTextField(controller: _last, label: 'Last name')),
              ]),
              const SizedBox(height: 16),
              AppTextField(controller: _email, label: 'Email', required: true, keyboard: TextInputType.emailAddress),
              const SizedBox(height: 16),
              AppDropdown<String>(
                label: 'Staff type',
                value: _type,
                items: _types,
                itemLabel: _pretty,
                onChanged: (v) => setState(() => _type = v ?? 'TEACHING'),
              ),
              const SizedBox(height: 16),
              AppDropdown<String>(
                label: 'Employment status',
                value: _status,
                items: _empStatus,
                itemLabel: _pretty,
                onChanged: (v) => setState(() => _status = v ?? 'ACTIVE'),
              ),
              const SizedBox(height: 24),
              PrimaryButton(
                label: _saving ? 'Saving…' : 'Save changes',
                icon: Icons.check_rounded,
                onPressed: _saving ? null : _save,
              ),
            ],
          ],
        );
      },
    );
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _email.dispose();
    super.dispose();
  }
}
