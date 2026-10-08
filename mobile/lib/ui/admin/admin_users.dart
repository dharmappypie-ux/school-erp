import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

({Color c, Color bg}) _statusStyle(String s) => switch (s) {
      'ACTIVE' => (c: AppColors.good, bg: AppColors.goodSoft),
      'SUSPENDED' => (c: AppColors.danger, bg: AppColors.dangerSoft),
      _ => (c: AppColors.muted, bg: AppColors.line),
    };

/// Shows a one-time password in a dialog so the admin can copy it.
Future<void> _showPasswordDialog(BuildContext context, String message) {
  // The password is the "Vidya-XXXXXX" token inside the message.
  final match = RegExp(r'Vidya-[A-Z0-9]{6}').firstMatch(message);
  final pw = match?.group(0);
  return showDialog(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('One-time password'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(message, style: const TextStyle(height: 1.4)),
        if (pw != null) ...[
          const SizedBox(height: 14),
          GestureDetector(
            onTap: () {
              Clipboard.setData(ClipboardData(text: pw));
              ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Password copied')));
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(color: AppColors.accentSoft, borderRadius: BorderRadius.circular(12)),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(pw, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.primary)),
                const Icon(Icons.copy_rounded, size: 18, color: AppColors.primary),
              ]),
            ),
          ),
        ],
      ]),
      actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Done'))],
    ),
  );
}

/// User management: list users, create one, change role, reset password, status.
class AdminUsersScreen extends ConsumerWidget {
  const AdminUsersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminUsersProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final roles = (async.value?['roles'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManageRoles = async.value?['canManageRoles'] == true;

    return DetailScaffold(
      title: 'Users',
      subtitle: '${items.length} logins',
      icon: Icons.manage_accounts_rounded,
      onRefresh: () async => ref.invalidate(adminUsersProvider),
      fab: FloatingActionButton.extended(
        backgroundColor: AppColors.primary, foregroundColor: Colors.white,
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CreateUserScreen(roles: roles))),
        icon: const Icon(Icons.person_add_alt_1_rounded), label: const Text('Add'),
      ),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Text('No users yet.', style: TextStyle(color: AppColors.muted)))
        else
          for (final u in items) ...[
            AppCard(
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => UserActionsScreen(user: u, roles: roles, canManageRoles: canManageRoles))),
              child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u['name']?.toString() ?? '', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text('${u['role'] ?? ''} · ${u['email'] ?? ''}',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                ])),
                StatusChip(
                  label: (u['status'] as String? ?? '').toLowerCase(),
                  color: _statusStyle(u['status'] as String? ?? '').c,
                  bg: _statusStyle(u['status'] as String? ?? '').bg,
                ),
                const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
              ]),
            ),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class CreateUserScreen extends ConsumerStatefulWidget {
  const CreateUserScreen({super.key, required this.roles});
  final List<Map<String, dynamic>> roles;
  @override
  ConsumerState<CreateUserScreen> createState() => _CreateUserScreenState();
}

class _CreateUserScreenState extends ConsumerState<CreateUserScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  String? _roleKey;
  bool _saving = false;

  Future<void> _save() async {
    if (_first.text.trim().isEmpty || _email.text.trim().isEmpty || _roleKey == null) {
      showToast(context, 'Name, email and role are required.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/users', {
      'firstName': _first.text.trim(),
      'lastName': _last.text.trim(),
      'email': _email.text.trim(),
      if (_phone.text.trim().isNotEmpty) 'phone': _phone.text.trim(),
      'roleKey': _roleKey,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    if (res.ok) {
      ref.invalidate(adminUsersProvider);
      await _showPasswordDialog(context, res.body?['message']?.toString() ?? 'User created.');
      if (mounted) Navigator.of(context).maybePop();
    } else {
      showToast(context, (res.body?['error'] ?? 'Could not create user.').toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'Add user',
        subtitle: 'Creates a login with a one-time password',
        icon: Icons.person_add_alt_1_rounded,
        children: [
          const SectionLabel('Details'),
          Row(children: [
            Expanded(child: AppTextField(controller: _first, label: 'First name', required: true)),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _last, label: 'Last name')),
          ]),
          const SizedBox(height: 16),
          AppTextField(controller: _email, label: 'Email', required: true, keyboard: TextInputType.emailAddress),
          const SizedBox(height: 16),
          AppTextField(controller: _phone, label: 'Phone', hint: 'Optional', keyboard: TextInputType.phone),
          const SizedBox(height: 16),
          AppDropdown<String>(
            label: 'Role',
            required: true,
            value: _roleKey,
            items: widget.roles.map((r) => r['key'] as String).toList(),
            itemLabel: (k) => (widget.roles.firstWhere((r) => r['key'] == k, orElse: () => const {})['name'] as String?) ?? k,
            onChanged: (v) => setState(() => _roleKey = v),
          ),
          const SizedBox(height: 24),
          PrimaryButton(label: _saving ? 'Creating…' : 'Create user', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() {
    _first.dispose(); _last.dispose(); _email.dispose(); _phone.dispose();
    super.dispose();
  }
}

class UserActionsScreen extends ConsumerStatefulWidget {
  const UserActionsScreen({super.key, required this.user, required this.roles, required this.canManageRoles});
  final Map<String, dynamic> user;
  final List<Map<String, dynamic>> roles;
  final bool canManageRoles;
  @override
  ConsumerState<UserActionsScreen> createState() => _UserActionsScreenState();
}

class _UserActionsScreenState extends ConsumerState<UserActionsScreen> {
  late String _roleKey = widget.user['roleKey']?.toString() ?? '';
  bool _busy = false;

  Future<void> _post(String path, Map<String, dynamic> body, {bool password = false}) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson(path, body);
    if (!mounted) return;
    setState(() => _busy = false);
    if (res.ok) {
      ref.invalidate(adminUsersProvider);
      if (password) {
        await _showPasswordDialog(context, res.body?['message']?.toString() ?? 'Password reset.');
      } else {
        showToast(context, (res.body?['message'] ?? 'Done.').toString());
      }
    } else {
      showToast(context, (res.body?['error'] ?? 'Could not update.').toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = widget.user;
    final id = u['id'] as String;
    final isSelf = u['isSelf'] == true;
    final status = u['status']?.toString() ?? 'ACTIVE';

    return DetailScaffold(
      title: u['name']?.toString() ?? 'User',
      subtitle: u['email']?.toString() ?? '',
      icon: Icons.manage_accounts_rounded,
      children: [
        if (widget.canManageRoles) ...[
          const SectionLabel('Role'),
          AppDropdown<String>(
            label: 'Role',
            value: _roleKey.isEmpty ? null : _roleKey,
            items: widget.roles.map((r) => r['key'] as String).toList(),
            itemLabel: (k) => (widget.roles.firstWhere((r) => r['key'] == k, orElse: () => const {})['name'] as String?) ?? k,
            onChanged: (v) => setState(() => _roleKey = v ?? _roleKey),
          ),
          const SizedBox(height: 12),
          PrimaryButton(
            label: 'Change role',
            icon: Icons.badge_rounded,
            onPressed: _busy ? null : () => _post('/api/mobile/v1/admin/users/$id/role', {'roleKey': _roleKey}),
          ),
          const SizedBox(height: 24),
        ],
        const SectionLabel('Account'),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
          child: Column(children: [
            RowTile(
              icon: Icons.lock_reset_rounded, iconBg: AppColors.accentSoft, iconColor: AppColors.primary,
              title: 'Reset password', subtitle: 'Issue a new one-time password',
              onTap: _busy ? null : () => _post('/api/mobile/v1/admin/users/$id/password', const {}, password: true),
            ),
            if (!isSelf) ...[
              const Hairline(),
              RowTile(
                icon: status == 'ACTIVE' ? Icons.block_rounded : Icons.check_circle_rounded,
                iconBg: status == 'ACTIVE' ? AppColors.dangerSoft : AppColors.goodSoft,
                iconColor: status == 'ACTIVE' ? AppColors.danger : AppColors.good,
                title: status == 'ACTIVE' ? 'Suspend account' : 'Activate account',
                subtitle: status == 'ACTIVE' ? 'Block sign-in' : 'Allow sign-in',
                onTap: _busy
                    ? null
                    : () => _post('/api/mobile/v1/admin/users/$id/status',
                        {'status': status == 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}),
              ),
            ],
          ]),
        ),
        if (isSelf) ...[
          const SizedBox(height: 10),
          const Center(child: Text("This is your own account.", style: TextStyle(fontSize: 12, color: AppColors.faint))),
        ],
      ],
    );
  }
}
