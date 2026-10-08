import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../homework/student_homework.dart' show openServerUrl;
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

String _glyph(String type) => switch (type) {
      'LINK' => '🔗',
      'PDF' => '📄',
      'VIDEO' => '🎬',
      'DOCUMENT' => '📝',
      'IMAGE' => '🖼️',
      _ => '📎',
    };

String _fmtDuration(num? minutes) {
  final m = (minutes ?? 0).toInt();
  if (m <= 0) return '—';
  final h = m ~/ 60;
  final mm = m % 60;
  if (h == 0) return '${mm}m';
  return mm == 0 ? '${h}h' : '${h}h ${mm}m';
}

/// One course: lessons with content, video and resources, each markable
/// complete — the mobile mirror of the web /portal/courses/[id].
class CourseDetailScreen extends ConsumerWidget {
  const CourseDetailScreen({super.key, required this.courseId});
  final String courseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(parentCourseProvider(courseId));
    final c = async.value;

    return DetailScaffold(
      title: c?['title']?.toString() ?? 'Course',
      subtitle: c?['subject']?.toString() ?? '',
      icon: Icons.play_lesson_rounded,
      onRefresh: () async => ref.invalidate(parentCourseProvider(courseId)),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (c == null)
          const AppCard(child: Text("Couldn't load this course — pull down to retry.",
              style: TextStyle(color: AppColors.muted)))
        else ...[
          _ProgressCard(c: c),
          if ((c['description']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 14),
            const SectionLabel('About this course'),
            AppCard(child: Text(c['description'].toString(), style: const TextStyle(height: 1.45))),
          ],
          const SizedBox(height: 14),
          const SectionLabel('Lessons'),
          for (final l in (c['lessons'] as List? ?? const []).cast<Map<String, dynamic>>())
            _LessonCard(courseId: courseId, lesson: l),
          if ((c['resources'] as List? ?? const []).isNotEmpty) ...[
            const SizedBox(height: 10),
            const SectionLabel('Course resources'),
            AppCard(
              child: Column(
                children: [
                  for (final r in (c['resources'] as List).cast<Map<String, dynamic>>())
                    _ResourceRow(r: r),
                ],
              ),
            ),
          ],
        ],
      ],
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.c});
  final Map<String, dynamic> c;

  @override
  Widget build(BuildContext context) {
    final done = (c['lessonsDone'] as num?)?.toInt() ?? 0;
    final total = (c['lessonCount'] as num?)?.toInt() ?? 0;
    final percent = (c['percent'] as num?)?.toInt() ?? 0;
    final complete = percent >= 100;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Your progress',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
              StatusChip(
                label: '$percent%',
                color: complete ? AppColors.good : AppColors.primary,
                bg: complete ? AppColors.goodSoft : AppColors.accentSoft,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text('$done of $total lessons complete',
              style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          const SizedBox(height: 12),
          ProgressBar(value: total == 0 ? 0 : done / total, color: complete ? AppColors.good : AppColors.primary),
        ],
      ),
    );
  }
}

class _LessonCard extends ConsumerStatefulWidget {
  const _LessonCard({required this.courseId, required this.lesson});
  final String courseId;
  final Map<String, dynamic> lesson;
  @override
  ConsumerState<_LessonCard> createState() => _LessonCardState();
}

class _LessonCardState extends ConsumerState<_LessonCard> {
  bool _saving = false;

  Future<void> _toggle(bool complete) async {
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/parent/lesson/complete', {
      'lessonId': widget.lesson['id'],
      'complete': complete,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    if (res.ok) {
      ref.invalidate(parentCourseProvider(widget.courseId));
      ref.invalidate(parentCoursesProvider);
    } else {
      showToast(context, res.body?['error']?.toString() ?? 'Could not update.', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.lesson;
    final done = l['done'] == true;
    final content = l['content']?.toString() ?? '';
    final video = l['videoUrl']?.toString();
    final resources = (l['resources'] as List? ?? const []).cast<Map<String, dynamic>>();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Lesson ${l['sequence']} · ${l['title']}',
                      style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                ),
                if (done)
                  const StatusChip(label: 'Completed', color: AppColors.good, bg: AppColors.goodSoft),
              ],
            ),
            const SizedBox(height: 2),
            Text(_fmtDuration(l['durationMinutes'] as num?),
                style: const TextStyle(fontSize: 12, color: AppColors.faint)),
            const SizedBox(height: 10),
            Text(content.isNotEmpty ? content : 'No written content for this lesson.',
                style: TextStyle(height: 1.45, color: content.isNotEmpty ? AppColors.ink : AppColors.muted)),
            if (video != null && video.isNotEmpty) ...[
              const SizedBox(height: 10),
              _LinkRow(glyph: '🎬', label: 'Watch the lesson video',
                  onTap: () => openServerUrl(ref, context, video)),
            ],
            for (final r in resources) _ResourceRow(r: r),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _saving ? null : () => _toggle(!done),
                icon: Icon(done ? Icons.undo_rounded : Icons.check_rounded, size: 18),
                label: Text(_saving ? 'Saving…' : (done ? 'Completed — undo' : 'Mark complete')),
                style: OutlinedButton.styleFrom(
                  foregroundColor: done ? AppColors.muted : AppColors.good,
                  side: BorderSide(color: done ? AppColors.line : AppColors.good),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResourceRow extends ConsumerWidget {
  const _ResourceRow({required this.r});
  final Map<String, dynamic> r;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _LinkRow(
      glyph: _glyph(r['type']?.toString() ?? 'OTHER'),
      label: r['title']?.toString() ?? 'Resource',
      onTap: () => openServerUrl(ref, context, r['url']?.toString() ?? ''),
    );
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({required this.glyph, required this.label, required this.onTap});
  final String glyph;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Text(glyph, style: const TextStyle(fontSize: 15)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(label,
                  style: const TextStyle(
                      fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.primary)),
            ),
            const Icon(Icons.open_in_new_rounded, size: 15, color: AppColors.faint),
          ],
        ),
      ),
    );
  }
}
