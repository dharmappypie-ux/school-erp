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
  final _last = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  String _status = 'ACTIVE';
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
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/student/${widget.studentId}', {
      'firstName': _first.text.trim(),
      'lastName': _last.text.trim(),
      'status': _status,
      if (_phone.text.trim().isNotEmpty) 'phone': _phone.text.trim(),
      if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),
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
          _first.text = (d['firstName'] as String?) ?? '';
          _last.text = (d['lastName'] as String?) ?? '';
          _phone.text = (d['phone'] as String?) ?? '';
          _email.text = (d['email'] as String?) ?? '';
          _status = (d['status'] as String?) ?? 'ACTIVE';
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
                Expanded(child: AppTextField(controller: _last, label: 'Last name')),
              ]),
              const SizedBox(height: 16),
              AppDropdown<String>(
                label: 'Status',
                value: _status,
                items: _statuses,
                itemLabel: (s) => s[0] + s.substring(1).toLowerCase().replaceAll('_', ' '),
                onChanged: (v) => setState(() => _status = v ?? 'ACTIVE'),
              ),
              const SizedBox(height: 16),
              AppTextField(controller: _phone, label: 'Phone', hint: 'Optional', keyboard: TextInputType.phone),
              const SizedBox(height: 16),
              AppTextField(controller: _email, label: 'Email', hint: 'Optional', keyboard: TextInputType.emailAddress),
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
    _first.dispose();
    _last.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }
}
