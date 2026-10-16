import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// One tenant: its profile, its plan, and the administrators who run it.
///
/// A school's internal data is deliberately absent — a platform owner
/// provisions and bills a school, they do not run it.
class SchoolDetailScreen extends ConsumerWidget {
  const SchoolDetailScreen({super.key, required this.schoolId, required this.name});
  final String schoolId;
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(platformSchoolProvider(schoolId));
    final data = async.value;
    final school = (data?['school'] as Map?)?.cast<String, dynamic>();
    final admins = (data?['admins'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final plans = (data?['plans'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: school?['name']?.toString() ?? name,
      subtitle: school == null ? 'Loading…' : '/${school['slug']}',
      icon: Icons.apartment_rounded,
      onRefresh: () async => ref.invalidate(platformSchoolProvider(schoolId)),
      children: [
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (school == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't load this school — pull down to retry.",
                    style: TextStyle(color: AppColors.muted)),
              ),
            ]),
          )
        else ...[
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.35,
            children: [
              StatTile(
                icon: Icons.school_rounded,
                value: '${school['students'] ?? 0}',
                label: 'Students',
                color: AppColors.primary,
              ),
              StatTile(
                icon: Icons.badge_rounded,
                value: '${school['staff'] ?? 0}',
                label: 'Staff',
                color: AppColors.teal,
              ),
              StatTile(
                icon: Icons.people_rounded,
                value: '${school['users'] ?? 0}',
                label: 'Logins',
                color: AppColors.gold,
              ),
              StatTile(
                icon: Icons.event_note_rounded,
                value: '${school['years'] ?? 0}',
                label: school['currentYear']?.toString() ?? 'No current year',
                color: AppColors.good,
              ),
            ],
          ),
          const SizedBox(height: 20),
          const SectionLabel('Profile'),
          AppCard(
            child: Column(children: [
              _Fact('Code', school['code']?.toString() ?? '—'),
              _Fact('Board', school['board']?.toString() ?? '—'),
              _Fact('Location', (school['location'] as String?)?.isNotEmpty == true
                  ? school['location'].toString()
                  : '—'),
              _Fact('Currency', school['currency']?.toString() ?? '—'),
              _Fact('Created', (school['createdAt'] as String?)?.split('T').first ?? '—'),
            ]),
          ),
          const SizedBox(height: 20),
          const SectionLabel('Subscription'),
          _PlanCard(schoolId: schoolId, current: school['plan']?.toString() ?? '', plans: plans),
          const SizedBox(height: 20),
          const SectionLabel('Tenant'),
          _ActiveCard(schoolId: schoolId, isActive: school['isActive'] == true),
          const SizedBox(height: 20),
          SectionLabel('Administrators · ${admins.length}'),
          if (admins.isEmpty)
            const AppCard(
              child: Text('No administrators — add one so the school can be set up.',
                  style: TextStyle(color: AppColors.muted)),
            )
          else
            for (final a in admins) ...[
              _AdminCard(schoolId: schoolId, admin: a),
              const SizedBox(height: 12),
            ],
          const SizedBox(height: 6),
          PrimaryButton(
            label: 'Add an administrator',
            icon: Icons.person_add_alt_1_rounded,
            onPressed: () => Navigator.of(context)
                .push(MaterialPageRoute(
                    builder: (_) => _AddAdminScreen(schoolId: schoolId, schoolName: name)))
                .then((_) => ref.invalidate(platformSchoolProvider(schoolId))),
          ),
        ],
      ],
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(children: [
          Expanded(
            child: Text(label, style: const TextStyle(fontSize: 13.5, color: AppColors.muted)),
          ),
          Flexible(
            child: Text(value,
                textAlign: TextAlign.right,
                // Clipped rather than wrapped: an address split mid-token
                // ("…edu.i / n") reads worse than one that is cut short.
                softWrap: false,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
          ),
        ]),
      );
}

class _PlanCard extends ConsumerStatefulWidget {
  const _PlanCard({required this.schoolId, required this.current, required this.plans});
  final String schoolId;
  final String current;
  final List<Map<String, dynamic>> plans;
  @override
  ConsumerState<_PlanCard> createState() => _PlanCardState();
}

class _PlanCardState extends ConsumerState<_PlanCard> {
  bool _busy = false;

  Future<void> _set(String plan) async {
    if (plan == widget.current) return;
    setState(() => _busy = true);
    final res = await ref
        .read(apiProvider)
        .postJson('/api/mobile/v1/platform/schools/${widget.schoolId}', {'plan': plan});
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = (res.body?['message'] ?? res.body?['error'] ?? 'Could not change the plan.')
        .toString();
    showToast(context, msg, error: !res.ok);
    if (res.ok) {
      ref.invalidate(platformSchoolProvider(widget.schoolId));
      ref.invalidate(platformSchoolsProvider);
    }
  }

  @override
  Widget build(BuildContext context) => AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Plan decides which modules the school can open.',
                style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final p in widget.plans)
                  GestureDetector(
                    onTap: _busy ? null : () => _set(p['key'].toString()),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                      decoration: BoxDecoration(
                        color: p['key'] == widget.current
                            ? AppColors.primary
                            : AppColors.surfaceSunken,
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                      ),
                      child: Text(
                        p['label']?.toString() ?? '',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: p['key'] == widget.current ? Colors.white : AppColors.muted,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      );
}

class _ActiveCard extends ConsumerStatefulWidget {
  const _ActiveCard({required this.schoolId, required this.isActive});
  final String schoolId;
  final bool isActive;
  @override
  ConsumerState<_ActiveCard> createState() => _ActiveCardState();
}

class _ActiveCardState extends ConsumerState<_ActiveCard> {
  bool _busy = false;

  Future<void> _toggle(bool value) async {
    // Switching a tenant off locks every one of its users out of both the app
    // and the web console, so it asks first.
    if (!value) {
      final sure = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Deactivate this school?'),
          content: const Text(
              'Nobody in this school will be able to sign in — on the app or the web '
              'console — until it is switched back on. Its data is untouched.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Deactivate', style: TextStyle(color: AppColors.danger)),
            ),
          ],
        ),
      );
      if (sure != true) return;
    }

    setState(() => _busy = true);
    final res = await ref
        .read(apiProvider)
        .postJson('/api/mobile/v1/platform/schools/${widget.schoolId}', {'isActive': value});
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = (res.body?['message'] ?? res.body?['error'] ?? 'Could not change that.')
        .toString();
    showToast(context, msg, error: !res.ok);
    if (res.ok) {
      ref.invalidate(platformSchoolProvider(widget.schoolId));
      ref.invalidate(platformSchoolsProvider);
    }
  }

  @override
  Widget build(BuildContext context) => AppCard(
        child: ToggleRow(
          title: widget.isActive ? 'Active' : 'Deactivated',
          subtitle: widget.isActive
              ? 'Everyone in this school can sign in'
              : 'Nobody in this school can sign in',
          value: widget.isActive,
          onChanged: _busy ? (_) {} : _toggle,
        ),
      );
}

class _AdminCard extends ConsumerStatefulWidget {
  const _AdminCard({required this.schoolId, required this.admin});
  final String schoolId;
  final Map<String, dynamic> admin;
  @override
  ConsumerState<_AdminCard> createState() => _AdminCardState();
}

class _AdminCardState extends ConsumerState<_AdminCard> {
  bool _busy = false;
  String? _password;

  Future<void> _act(String action, [String? value]) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson(
      '/api/mobile/v1/platform/schools/${widget.schoolId}/admins/${widget.admin['id']}',
      {'action': action, if (value != null) 'value': value},
    );
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = (res.body?['message'] ?? res.body?['error'] ?? 'Could not do that.').toString();
    if (res.ok && action == 'password') {
      // Carries a one-time password; a toast would scroll it away.
      setState(() => _password = msg);
    } else {
      showToast(context, msg, error: !res.ok);
    }
    if (res.ok) ref.invalidate(platformSchoolProvider(widget.schoolId));
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.admin;
    final active = a['status'] == 'ACTIVE';
    final isSuper = a['roleKey'] == 'SUPER_ADMIN';
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a['name']?.toString() ?? '',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(a['email']?.toString() ?? '',
                      style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                ],
              ),
            ),
            StatusChip(
              label: active ? a['roleName']?.toString() ?? 'Admin' : 'Suspended',
              color: active ? AppColors.good : AppColors.danger,
              bg: active ? AppColors.goodSoft : AppColors.dangerSoft,
            ),
          ]),
          if (a['mustChangePassword'] == true) ...[
            const SizedBox(height: 8),
            const Text('Still on a temporary password',
                style: TextStyle(fontSize: 12, color: AppColors.warn, fontWeight: FontWeight.w600)),
          ],
          if (_password != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                  color: AppColors.goodSoft, borderRadius: BorderRadius.circular(AppRadius.chip)),
              child: SelectableText(_password!,
                  style: const TextStyle(fontSize: 13, height: 1.4, fontWeight: FontWeight.w600)),
            ),
          ],
          const SizedBox(height: 12),
          const Hairline(),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Act(
                label: isSuper ? 'Make admin' : 'Make super admin',
                onTap: _busy ? null : () => _act('role', isSuper ? 'ADMIN' : 'SUPER_ADMIN'),
              ),
              _Act(
                label: 'Reset password',
                onTap: _busy ? null : () => _act('password'),
              ),
              _Act(
                label: active ? 'Suspend' : 'Activate',
                danger: active,
                onTap: _busy ? null : () => _act('status', active ? 'SUSPENDED' : 'ACTIVE'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Act extends StatelessWidget {
  const _Act({required this.label, required this.onTap, this.danger = false});
  final String label;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
          decoration: BoxDecoration(
            color: danger ? AppColors.dangerSoft : AppColors.accentSoft,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: Text(label,
              style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: danger ? AppColors.danger : AppColors.primary)),
        ),
      );
}

class _AddAdminScreen extends ConsumerStatefulWidget {
  const _AddAdminScreen({required this.schoolId, required this.schoolName});
  final String schoolId;
  final String schoolName;
  @override
  ConsumerState<_AddAdminScreen> createState() => _AddAdminScreenState();
}

class _AddAdminScreenState extends ConsumerState<_AddAdminScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  String _role = 'ADMIN';
  bool _saving = false;
  String? _created;

  Future<void> _save() async {
    if (_first.text.trim().isEmpty || !_email.text.contains('@')) {
      showToast(context, 'Enter a name and a valid email.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref
        .read(apiProvider)
        .postJson('/api/mobile/v1/platform/schools/${widget.schoolId}/admins', {
      'firstName': _first.text.trim(),
      'lastName': _last.text.trim(),
      'email': _email.text.trim(),
      'roleKey': _role,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = (res.body?['message'] ?? res.body?['error'] ?? 'Could not add them.').toString();
    if (res.ok && res.body?['ok'] == true) {
      ref.invalidate(platformSchoolProvider(widget.schoolId));
      setState(() => _created = msg);
    } else {
      showToast(context, msg, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_created != null) {
      return DetailScaffold(
        title: 'Administrator added',
        subtitle: 'Hand the password over now',
        icon: Icons.check_circle_rounded,
        children: [
          AppCard(child: SelectableText(_created!, style: const TextStyle(height: 1.5))),
          const SizedBox(height: 14),
          const Text(
            'Shown only once. They must change it at first sign-in.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 22),
          PrimaryButton(
            label: 'Done',
            icon: Icons.check_rounded,
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ],
      );
    }

    return DetailScaffold(
      title: 'Add administrator',
      subtitle: widget.schoolName,
      icon: Icons.person_add_alt_1_rounded,
      children: [
        const SectionLabel('Who'),
        Row(children: [
          Expanded(child: AppTextField(controller: _first, label: 'First name', required: true)),
          const SizedBox(width: 12),
          Expanded(child: AppTextField(controller: _last, label: 'Last name')),
        ]),
        const SizedBox(height: 12),
        AppTextField(
            controller: _email,
            label: 'Email',
            required: true,
            keyboard: TextInputType.emailAddress),
        const SizedBox(height: 18),
        const SectionLabel('Role'),
        AppDropdown<String>(
          label: 'Role',
          value: _role,
          items: const ['ADMIN', 'SUPER_ADMIN'],
          itemLabel: (k) =>
              k == 'SUPER_ADMIN' ? 'Super Administrator' : 'School Administrator',
          onChanged: (v) => setState(() => _role = v ?? 'ADMIN'),
        ),
        const SizedBox(height: 22),
        PrimaryButton(
          label: _saving ? 'Adding…' : 'Add administrator',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _save,
        ),
      ],
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
