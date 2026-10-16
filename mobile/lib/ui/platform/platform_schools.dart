import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'new_school.dart';
import 'school_detail.dart';

/// Every tenant on the platform. The owner's home tab.
class PlatformSchoolsTab extends ConsumerWidget {
  const PlatformSchoolsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(platformSchoolsProvider);
    final data = async.value;
    final schools = (data?['schools'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final totals = (data?['totals'] as Map?)?.cast<String, dynamic>() ?? const {};

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async => ref.invalidate(platformSchoolsProvider),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          AppScreenHeader(
            eyebrowText: 'Platform',
            title: 'Schools',
            trailing: _AddSchoolButton(
              onTap: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const NewSchoolScreen()))
                  .then((_) => ref.invalidate(platformSchoolsProvider)),
            ),
          ),
          const SizedBox(height: 18),
          if (async.isLoading && data == null)
            const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
          else if (data == null)
            const AppCard(
              child: Row(children: [
                Icon(Icons.cloud_off_rounded, color: AppColors.warn),
                SizedBox(width: 12),
                Expanded(
                  child: Text("Couldn't reach the platform — pull down to retry.",
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
                  icon: Icons.apartment_rounded,
                  value: '${totals['schools'] ?? 0}',
                  label: '${totals['active'] ?? 0} active',
                  color: AppColors.primary,
                ),
                StatTile(
                  icon: Icons.school_rounded,
                  value: '${totals['students'] ?? 0}',
                  label: 'Students, all schools',
                  color: AppColors.teal,
                ),
                StatTile(
                  icon: Icons.badge_rounded,
                  value: '${totals['staff'] ?? 0}',
                  label: 'Staff, all schools',
                  color: AppColors.gold,
                ),
                StatTile(
                  icon: Icons.add_business_rounded,
                  value: 'New',
                  label: 'Provision a school',
                  color: AppColors.good,
                  onTap: () => Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => const NewSchoolScreen()))
                      .then((_) => ref.invalidate(platformSchoolsProvider)),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SectionLabel('All schools · ${schools.length}'),
            if (schools.isEmpty)
              const AppCard(
                child: Text('No schools yet. Tap “New” to create the first tenant.',
                    style: TextStyle(color: AppColors.muted)),
              )
            else
              for (final s in schools) ...[
                _SchoolCard(school: s),
                const SizedBox(height: 12),
              ],
            const SizedBox(height: 6),
            const Text(
              'Creating a school sets up its roles, current academic year and first '
              'super admin. That admin signs in with the one-time password and adds '
              'their own staff, classes and students — a school’s internal data is '
              'never managed from here.',
              style: TextStyle(fontSize: 12, color: AppColors.faint, height: 1.5),
            ),
          ],
        ],
      ),
    );
  }
}

class _AddSchoolButton extends StatelessWidget {
  const _AddSchoolButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            gradient: kHeroGradient,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            boxShadow: kHeroShadow,
          ),
          child: const Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.add_rounded, color: Colors.white, size: 18),
            SizedBox(width: 5),
            Text('New',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
          ]),
        ),
      );
}

class _SchoolCard extends ConsumerWidget {
  const _SchoolCard({required this.school});
  final Map<String, dynamic> school;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = school['isActive'] == true;
    final location = (school['location'] as String?) ?? '';
    return AppCard(
      onTap: () => Navigator.of(context)
          .push(MaterialPageRoute(
              builder: (_) => SchoolDetailScreen(
                    schoolId: school['id'].toString(),
                    name: school['name']?.toString() ?? 'School',
                  )))
          .then((_) => ref.invalidate(platformSchoolsProvider)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(school['name']?.toString() ?? '',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 3),
                    Text(
                      '/${school['slug']}'
                      '${school['code'] != null ? " · ${school['code']}" : ""}'
                      '${location.isNotEmpty ? " · $location" : ""}',
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              StatusChip(
                label: active ? 'Active' : 'Off',
                color: active ? AppColors.good : AppColors.danger,
                bg: active ? AppColors.goodSoft : AppColors.dangerSoft,
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Hairline(),
          const SizedBox(height: 12),
          Row(
            children: [
              _Metric(label: 'Plan', value: school['planLabel']?.toString() ?? '—'),
              _Metric(label: 'Students', value: '${school['students'] ?? 0}'),
              _Metric(label: 'Staff', value: '${school['staff'] ?? 0}'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(), style: eyebrow(AppColors.faint)),
            const SizedBox(height: 3),
            Text(value,
                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
          ],
        ),
      );
}
