import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'course_detail.dart';
import 'quizzes_screen.dart';

({Color c, Color bg, String label}) _priority(String p) => switch (p) {
      'high' => (c: AppColors.danger, bg: AppColors.dangerSoft, label: 'Focus first'),
      'medium' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Work on'),
      _ => (c: AppColors.primary, bg: AppColors.accentSoft, label: 'Keep going'),
    };

/// The child's personalized learning plan — strengths, what to work on (with
/// linked courses/quizzes) and study tips. Mobile mirror of /portal/learning-plan.
class LearningPlanScreen extends ConsumerWidget {
  const LearningPlanScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(learningPlanProvider);
    final d = async.value;
    final hasData = d?['hasData'] == true;

    return DetailScaffold(
      title: 'Learning plan',
      subtitle: d?['studentName']?.toString() ?? 'Personalized for you',
      icon: Icons.auto_graph_rounded,
      onRefresh: () async => ref.invalidate(learningPlanProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (d == null)
          const AppCard(child: Text("Couldn't reach the school — pull down to retry.",
              style: TextStyle(color: AppColors.muted)))
        else if (!hasData)
          const AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Not enough data yet',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                SizedBox(height: 6),
                Text('Once there are marks, quiz results or attendance on record, a personalized plan will appear here.',
                    style: TextStyle(color: AppColors.muted, height: 1.4)),
              ],
            ),
          )
        else ...[
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(d['headline']?.toString() ?? '',
                    style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, height: 1.35)),
                if ((d['strengths'] as List?)?.isNotEmpty == true) ...[
                  const SizedBox(height: 8),
                  RichText(
                    text: TextSpan(
                      style: const TextStyle(fontSize: 13.5, color: AppColors.muted, height: 1.4),
                      children: [
                        const TextSpan(text: 'Strengths: ',
                            style: TextStyle(color: AppColors.good, fontWeight: FontWeight.w700)),
                        TextSpan(text: '${(d['strengths'] as List).join(', ')}.'),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          const SectionLabel('What to work on'),
          if ((d['recommendations'] as List?)?.isEmpty ?? true)
            const AppCard(child: Text("You're on track — keep up the good work!",
                style: TextStyle(color: AppColors.muted)))
          else
            for (final r in (d['recommendations'] as List).cast<Map<String, dynamic>>())
              _RecCard(r),
          const SizedBox(height: 16),
          const SectionLabel('Study tips'),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final tip in (d['tips'] as List? ?? const []))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('✦ ', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800)),
                        Expanded(child: Text(tip.toString(), style: const TextStyle(height: 1.4))),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _RecCard extends StatelessWidget {
  const _RecCard(this.r);
  final Map<String, dynamic> r;

  @override
  Widget build(BuildContext context) {
    final p = _priority(r['priority']?.toString() ?? 'low');
    final courseId = r['courseId']?.toString();
    final quizId = r['quizId']?.toString();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(r['focus']?.toString() ?? '',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                ),
                StatusChip(label: p.label, color: p.c, bg: p.bg),
              ],
            ),
            const SizedBox(height: 6),
            Text(r['reason']?.toString() ?? '',
                style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.4)),
            const SizedBox(height: 2),
            Text(r['action']?.toString() ?? '', style: const TextStyle(fontSize: 13.5, height: 1.4)),
            if (courseId != null || quizId != null) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (courseId != null)
                    _Pill(
                      glyph: '📘',
                      label: r['courseTitle']?.toString() ?? 'Course',
                      onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => CourseDetailScreen(courseId: courseId))),
                    ),
                  if (quizId != null)
                    _Pill(
                      glyph: '📝',
                      label: r['quizTitle']?.toString() ?? 'Quiz',
                      onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => QuizDetailScreen(quizId: quizId))),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.glyph, required this.label, required this.onTap});
  final String glyph;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.accentSoft,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(glyph),
            const SizedBox(width: 6),
            Text(label,
                style: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.primary)),
          ],
        ),
      ),
    );
  }
}
