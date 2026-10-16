import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'admin_audit.dart';
import 'admin_roles.dart';
import 'admin_users.dart';
import 'admin_years.dart';

/// School settings: the profile every screen is stamped with, the roles that
/// decide who may do what, the academic years, and the way into the audit
/// trail. Read-only where the web console is read-only — the profile is edited
/// in neither place.
class AdminSettingsScreen extends ConsumerWidget {
  const AdminSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminSettingsProvider);
    final data = async.value;
    final school = (data?['school'] as Map?)?.cast<String, dynamic>();
    final counts = (data?['counts'] as Map?)?.cast<String, dynamic>() ?? const {};
    final roles = (data?['roles'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final years = (data?['years'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final audit = (data?['audit'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final features = (school?['features'] as List?)?.map((e) => e.toString()).toList() ?? const [];

    void open(Widget screen) =>
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

    return DetailScaffold(
      title: 'Settings',
      subtitle: 'Profile, roles, years and history',
      icon: Icons.settings_rounded,
      onRefresh: () async => ref.invalidate(adminSettingsProvider),
      children: [
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (school == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't reach the school — pull down to retry.",
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
                icon: Icons.people_rounded,
                value: '${counts['users'] ?? 0}',
                // The value is the login count; the label has to say so, or the
                // tile reads as "755 roles".
                label: 'Logins · ${counts['roles'] ?? 0} roles',
                color: AppColors.primary,
                onTap: data?['canManageUsers'] == true
                    ? () => open(const AdminUsersScreen())
                    : null,
              ),
              StatTile(
                icon: Icons.event_note_rounded,
                value: '${counts['years'] ?? 0}',
                label: years.firstWhere((y) => y['isCurrent'] == true,
                            orElse: () => const {})['name']
                        ?.toString() ??
                    'No current year',
                color: AppColors.teal,
                onTap: data?['canManageYears'] == true
                    ? () => open(const AdminYearsScreen())
                    : null,
              ),
              StatTile(
                icon: Icons.workspace_premium_rounded,
                value: school['planLabel']?.toString() ?? '—',
                label: '${features.length} modules unlocked',
                color: AppColors.gold,
              ),
              StatTile(
                icon: Icons.verified_user_rounded,
                value: school['isActive'] == true ? 'Active' : 'Inactive',
                label: 'School status',
                color: school['isActive'] == true ? AppColors.good : AppColors.danger,
              ),
            ],
          ),
          const SizedBox(height: 20),
          const SectionLabel('School profile'),
          AppCard(
            child: Column(children: [
              _Fact('Name', school['name']?.toString() ?? '—'),
              _Fact('Code', school['code']?.toString() ?? '—'),
              _Fact('Slug', '/${school['slug']}'),
              _Fact('Board', school['board']?.toString() ?? '—'),
              _Fact('Email', school['email']?.toString() ?? '—'),
              _Fact('Phone', school['phone']?.toString() ?? '—'),
              _Fact('Address', (school['address'] as String?)?.isNotEmpty == true
                  ? school['address'].toString()
                  : '—'),
              _Fact('Currency', school['currency']?.toString() ?? '—'),
              _Fact('Timezone', school['timezone']?.toString() ?? '—'),
            ]),
          ),
          const SizedBox(height: 20),
          SectionLabel('Roles · ${roles.length}'),
          AppCard(
            child: Column(children: [
              for (var i = 0; i < roles.length; i++) ...[
                if (i > 0) const Hairline(),
                RowTile(
                  title: roles[i]['name']?.toString() ?? '',
                  subtitle: roles[i]['key']?.toString() ?? '',
                  trailing: Text(
                    roles[i]['permissionCount'] == null
                        ? 'All access'
                        : '${roles[i]['permissionCount']} perms · ${roles[i]['users']} user(s)',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ),
              ],
            ]),
          ),
          if (data?['canManageRoles'] == true) ...[
            const SizedBox(height: 12),
            PrimaryButton(
              label: 'Edit roles & permissions',
              icon: Icons.shield_rounded,
              onPressed: () => open(const AdminRolesScreen()),
            ),
          ],
          const SizedBox(height: 20),
          SectionLabel('Academic years · ${years.length}'),
          AppCard(
            child: Column(children: [
              for (var i = 0; i < years.length; i++) ...[
                if (i > 0) const Hairline(),
                RowTile(
                  title: years[i]['name']?.toString() ?? '',
                  subtitle: '${years[i]['sections'] ?? 0} sections'
                      '${years[i]['isLocked'] == true ? " · locked" : ""}',
                  trailing: years[i]['isCurrent'] == true
                      ? const StatusChip(
                          label: 'Current', color: AppColors.good, bg: AppColors.goodSoft)
                      : null,
                ),
              ],
            ]),
          ),
          if (data?['canAudit'] == true) ...[
            const SizedBox(height: 20),
            const SectionLabel('Recent activity'),
            AppCard(
              child: Column(children: [
                if (audit.isEmpty)
                  const Text('Nothing recorded yet.', style: TextStyle(color: AppColors.muted))
                else
                  for (var i = 0; i < audit.length; i++) ...[
                    if (i > 0) const Hairline(),
                    RowTile(
                      title: audit[i]['action']?.toString() ?? '',
                      subtitle: '${audit[i]['by']} · ${audit[i]['entityType']}',
                      trailing: Text(
                        (audit[i]['at'] as String?)?.split('T').first ?? '',
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    ),
                  ],
              ]),
            ),
            const SizedBox(height: 12),
            PrimaryButton(
              label: 'Open the audit log',
              icon: Icons.history_rounded,
              onPressed: () => open(const AdminAuditScreen()),
            ),
          ],
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
