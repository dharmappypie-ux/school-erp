import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'class_detail.dart';

class TeacherClassesScreen extends ConsumerWidget {
  const TeacherClassesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(teacherClassesProvider);
    final sections = (async.value?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async => ref.invalidate(teacherClassesProvider),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          const AppScreenHeader(title: 'My classes', eyebrowText: 'Teacher'),
          const SizedBox(height: 18),
          if (async.isLoading)
            const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
          else if (sections.isEmpty)
            const AppCard(
                child: Text('No classes assigned yet.', style: TextStyle(color: AppColors.muted)))
          else
            for (final s in sections)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => ClassDetailScreen(
                      sectionId: s['id'] as String,
                      sectionName: s['name'] as String,
                      isClassTeacher: s['isClassTeacher'] == true,
                    ),
                  )),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                            gradient: kHeroGradient, borderRadius: BorderRadius.circular(14)),
                        child: const Icon(Icons.groups_rounded, color: Colors.white),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(s['name'] as String,
                                style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                Text('${s['studentCount']} students',
                                    style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                                if (s['isClassTeacher'] == true) ...[
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(
                                        color: AppColors.accentSoft,
                                        borderRadius: BorderRadius.circular(AppRadius.pill)),
                                    child: const Text('Class teacher',
                                        style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.primary)),
                                  ),
                                ],
                              ],
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}
