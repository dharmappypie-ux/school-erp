import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'student_detail.dart';

/// Families on the roll.
///
/// Two signals describe a family — an explicit sibling record, and a guardian
/// shared between students — and the server merges them, so a family both
/// describe appears once rather than twice.
class AdminSiblingsScreen extends ConsumerWidget {
  const AdminSiblingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminSiblingsProvider);
    final data = async.value;
    final families = (data?['families'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final totals = (data?['totals'] as Map?)?.cast<String, dynamic>() ?? const {};

    return DetailScaffold(
      title: 'Siblings',
      subtitle: 'Families across the roll',
      icon: Icons.family_restroom_rounded,
      onRefresh: () async => ref.invalidate(adminSiblingsProvider),
      children: [
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (data == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't load the report — pull down to retry.",
                    style: TextStyle(color: AppColors.muted)),
              ),
            ]),
          )
        else ...[
          Row(children: [
            Expanded(
              child: StatTile(
                icon: Icons.family_restroom_rounded,
                value: '${totals['families'] ?? 0}',
                label: 'Families with siblings',
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: StatTile(
                icon: Icons.school_rounded,
                value: '${totals['withSiblings'] ?? 0}',
                label: 'of ${totals['students'] ?? 0} students',
                color: AppColors.teal,
              ),
            ),
          ]),
          const SizedBox(height: 20),
          if (families.isEmpty)
            const AppCard(
              child: Text(
                'No families found. Siblings are detected from an explicit sibling '
                'record or a guardian shared between students.',
                style: TextStyle(color: AppColors.muted, height: 1.4),
              ),
            )
          else
            for (final family in families) ...[
              _FamilyCard(family: family),
              const SizedBox(height: 12),
            ],
        ],
      ],
    );
  }
}

class _FamilyCard extends StatelessWidget {
  const _FamilyCard({required this.family});
  final Map<String, dynamic> family;

  @override
  Widget build(BuildContext context) {
    final students = (family['students'] as List).cast<Map<String, dynamic>>();
    final guardians = (family['guardians'] as List).cast<Map<String, dynamic>>();
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(
                guardians.isEmpty
                    ? '${family['size']} siblings'
                    : guardians.map((g) => g['name']).join(' · '),
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
              ),
            ),
            StatusChip(
              label: '${family['size']}',
              color: AppColors.primary,
              bg: AppColors.accentSoft,
            ),
          ]),
          if (guardians.any((g) => g['phone'] != null)) ...[
            const SizedBox(height: 3),
            Text(
              guardians.where((g) => g['phone'] != null).map((g) => g['phone']).join(' · '),
              style: const TextStyle(fontSize: 12, color: AppColors.muted),
            ),
          ],
          const SizedBox(height: 10),
          const Hairline(),
          for (final s in students)
            RowTile(
              title: s['name']?.toString() ?? '',
              subtitle: '${s['className']} · ${s['admissionNo']}',
              icon: Icons.person_rounded,
              iconColor: AppColors.teal,
              iconBg: AppColors.tealSoft,
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => StudentDetailScreen(studentId: s['id'].toString()))),
            ),
        ],
      ),
    );
  }
}
