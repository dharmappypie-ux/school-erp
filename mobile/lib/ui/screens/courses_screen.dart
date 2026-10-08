import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'course_detail.dart';

/// Published courses for the child's class, with the child's own progress, each
/// opening a lesson-by-lesson detail — the mobile mirror of /portal/courses.
class CoursesScreen extends ConsumerWidget {
  const CoursesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(parentCoursesProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final done = items.fold<int>(0, (s, c) => s + ((c['lessonsDone'] as num?)?.toInt() ?? 0));
    final total = items.fold<int>(0, (s, c) => s + ((c['lessons'] as num?)?.toInt() ?? 0));
    final offline = !async.isLoading && async.value == null;

    return DetailScaffold(
      title: 'Courses',
      subtitle: 'Keep your learning streak going',
      icon: Icons.play_lesson_rounded,
      onRefresh: () async => ref.invalidate(parentCoursesProvider),
      hero: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('LESSONS COMPLETED', style: eyebrow(Colors.white.withValues(alpha: 0.85))),
                const SizedBox(height: 6),
                Text('$done / $total',
                    style: const TextStyle(
                        color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800, height: 1)),
                const SizedBox(height: 12),
                ProgressBar(value: total == 0 ? 0 : done / total, color: Colors.white, height: 7),
              ],
            ),
          ),
        ],
      ),
      children: [
        const SectionLabel('Your tracks'),
        if (async.isLoading)
          const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(child: Text("Couldn't reach the school — pull down to retry.",
              style: TextStyle(color: AppColors.muted)))
        else if (items.isEmpty)
          const AppCard(child: Text('No courses published for your class yet.',
              style: TextStyle(color: AppColors.muted)))
        else
          for (final c in items) _CourseCard(c),
      ],
    );
  }
}

class _CourseCard extends StatelessWidget {
  const _CourseCard(this.c);
  final Map<String, dynamic> c;

  @override
  Widget build(BuildContext context) {
    final lessons = (c['lessons'] as num?)?.toInt() ?? 0;
    final lessonsDone = (c['lessonsDone'] as num?)?.toInt() ?? 0;
    final percent = (c['percent'] as num?)?.toInt() ?? 0;
    final complete = lessons > 0 && lessonsDone >= lessons;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => CourseDetailScreen(courseId: c['id'].toString()))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                      gradient: kHeroGradient, borderRadius: BorderRadius.circular(13)),
                  child: const Icon(Icons.auto_stories_rounded, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c['title']?.toString() ?? '',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(
                        '${c['subject'] ?? ''}${c['teacher'] != null ? ' · ${c['teacher']}' : ''}',
                        style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
                if (complete)
                  const Icon(Icons.verified_rounded, color: AppColors.good, size: 22)
                else
                  const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(child: ProgressBar(value: lessons == 0 ? 0 : lessonsDone / lessons,
                    color: complete ? AppColors.good : AppColors.primary)),
                const SizedBox(width: 12),
                Text('$percent%',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: complete ? AppColors.good : AppColors.primary)),
              ],
            ),
            const SizedBox(height: 6),
            Text('$lessonsDone of $lessons lessons',
                style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}
