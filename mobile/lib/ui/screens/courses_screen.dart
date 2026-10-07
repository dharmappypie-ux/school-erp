import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

class CoursesScreen extends ConsumerWidget {
  const CoursesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final courses = ref.watch(coursesProvider);
    final list = courses.value ?? const [];
    final done = list.fold<int>(0, (s, c) => s + c.lessonsDone);
    final total = list.fold<int>(0, (s, c) => s + c.lessons);

    return DetailScaffold(
      title: 'Courses & quizzes',
      subtitle: 'Keep your learning streak going',
      icon: Icons.play_lesson_rounded,
      onRefresh: () async {
        await ref.read(syncProvider).sync(manual: true);
        refreshData(ref);
      },
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
                ProgressBar(
                    value: total == 0 ? 0 : done / total,
                    color: Colors.white,
                    height: 7),
              ],
            ),
          ),
        ],
      ),
      children: [
        const SectionLabel('Your tracks'),
        courses.when(
          loading: () => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
          error: (e, _) => AppCard(child: Text('$e')),
          data: (items) => Column(children: [for (final c in items) _CourseCard(c)]),
        ),
      ],
    );
  }
}

class _CourseCard extends StatelessWidget {
  const _CourseCard(this.c);
  final CourseItem c;

  @override
  Widget build(BuildContext context) {
    final complete = c.lessonsDone >= c.lessons;
    final pct = (c.progress * 100).round();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
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
                      Text(c.title,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(c.subject,
                          style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                    ],
                  ),
                ),
                if (complete)
                  const Icon(Icons.verified_rounded, color: AppColors.good, size: 22),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                    child: ProgressBar(
                        value: c.progress, color: complete ? AppColors.good : AppColors.primary)),
                const SizedBox(width: 12),
                Text('$pct%',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: complete ? AppColors.good : AppColors.primary)),
              ],
            ),
            const SizedBox(height: 6),
            Text('${c.lessonsDone} of ${c.lessons} lessons',
                style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}
