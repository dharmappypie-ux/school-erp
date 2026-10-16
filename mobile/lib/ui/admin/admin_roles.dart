import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Roles and the permissions they grant.
///
/// The catalogue comes from the server rather than a copy in the app, so the
/// editor can never offer a key the backend does not know — or miss one it
/// gained.
class AdminRolesScreen extends ConsumerWidget {
  const AdminRolesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminRolesProvider);
    final data = async.value;
    final roles = (data?['roles'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final catalogue = (data?['catalogue'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Roles & permissions',
      subtitle: data == null ? 'Loading…' : '${roles.length} roles',
      icon: Icons.shield_rounded,
      onRefresh: () async => ref.invalidate(adminRolesProvider),
      children: [
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (data == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't load the roles — pull down to retry.",
                    style: TextStyle(color: AppColors.muted)),
              ),
            ]),
          )
        else ...[
          for (final role in roles) ...[
            AppCard(
              onTap: () => Navigator.of(context)
                  .push(MaterialPageRoute(
                      builder: (_) => _RoleEditor(role: role, catalogue: catalogue)))
                  .then((_) => ref.invalidate(adminRolesProvider)),
              child: Row(children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(role['name']?.toString() ?? '',
                          style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 3),
                      Text(role['description']?.toString() ?? role['key']?.toString() ?? '',
                          style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                      const SizedBox(height: 8),
                      Text(
                        role['allAccess'] == true
                            ? 'Everything · ${role['users']} user(s)'
                            : '${(role['permissions'] as List?)?.length ?? 0} permissions · ${role['users']} user(s)',
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
              ]),
            ),
            const SizedBox(height: 12),
          ],
          const SizedBox(height: 6),
          const Text(
            'Changing a role takes effect the moment its holders next ask the server '
            'for anything — their signed-in sessions are not revoked.',
            style: TextStyle(fontSize: 12, color: AppColors.faint, height: 1.5),
          ),
        ],
      ],
    );
  }
}

class _RoleEditor extends ConsumerStatefulWidget {
  const _RoleEditor({required this.role, required this.catalogue});
  final Map<String, dynamic> role;
  final List<Map<String, dynamic>> catalogue;
  @override
  ConsumerState<_RoleEditor> createState() => _RoleEditorState();
}

class _RoleEditorState extends ConsumerState<_RoleEditor> {
  late Set<String> _granted;
  late bool _allAccess;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _granted = ((widget.role['permissions'] as List?) ?? const [])
        .map((e) => e.toString())
        .toSet();
    _allAccess = _granted.contains('*');
  }

  /// Does the current set grant this key — directly, by module wildcard, or by
  /// the all-access wildcard? Mirrors the server's `hasPermission`.
  bool _has(String key) {
    if (_allAccess) return true;
    if (_granted.contains(key)) return true;
    return _granted.contains('${key.split('.').first}.*');
  }

  void _toggle(String key, bool on) {
    setState(() {
      if (on) {
        _granted.add(key);
      } else {
        _granted.remove(key);
        // A module wildcard would silently re-grant what was just removed, so
        // it is expanded into the keys that are staying.
        final module = key.split('.').first;
        if (_granted.remove('$module.*')) {
          for (final group in widget.catalogue) {
            if (group['module'] != module) continue;
            for (final item in (group['items'] as List).cast<Map<String, dynamic>>()) {
              final other = item['key'].toString();
              if (other != key) _granted.add(other);
            }
          }
        }
      }
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/roles', {
      'roleId': widget.role['id'],
      'permissions': _allAccess ? ['*'] : _granted.toList(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = (res.body?['message'] ?? res.body?['error'] ?? 'Could not save.').toString();
    showToast(context, msg, error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminRolesProvider);
      ref.invalidate(adminSettingsProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isPlatform = widget.role['key'] == 'PLATFORM_ADMIN';
    final count = _allAccess
        ? 'everything'
        : '${_granted.length} permission${_granted.length == 1 ? "" : "s"}';

    return DetailScaffold(
      title: widget.role['name']?.toString() ?? 'Role',
      subtitle: 'Grants $count',
      icon: Icons.shield_rounded,
      children: [
        if (isPlatform)
          const AppCard(
            child: Row(children: [
              Icon(Icons.lock_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'The platform owner’s role sits above any school and is not edited '
                  'from here.',
                  style: TextStyle(color: AppColors.muted, height: 1.4),
                ),
              ),
            ]),
          )
        else ...[
          AppCard(
            child: ToggleRow(
              title: 'All access',
              subtitle: 'Everything this school can do, now and in future',
              value: _allAccess,
              onChanged: (v) => setState(() => _allAccess = v),
            ),
          ),
          const SizedBox(height: 18),
          for (final group in widget.catalogue) ...[
            SectionLabel(_moduleLabel(group['module'].toString())),
            AppCard(
              child: Column(children: [
                for (final item in (group['items'] as List).cast<Map<String, dynamic>>())
                  Opacity(
                    opacity: _allAccess ? 0.45 : 1,
                    child: ToggleRow(
                      title: item['key'].toString().split('.').last,
                      subtitle: item['label'].toString(),
                      value: _has(item['key'].toString()),
                      onChanged: _allAccess
                          ? (_) {}
                          : (v) => _toggle(item['key'].toString(), v),
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: 16),
          ],
          const SizedBox(height: 6),
          PrimaryButton(
            label: _saving ? 'Saving…' : 'Save permissions',
            icon: Icons.check_rounded,
            onPressed: _saving ? null : _save,
          ),
        ],
      ],
    );
  }

  static String _moduleLabel(String module) =>
      module.isEmpty ? module : module[0].toUpperCase() + module.substring(1);
}
