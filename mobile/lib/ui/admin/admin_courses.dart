import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';
import 'admin_course_detail.dart';

({Color c, Color bg}) _st(String s) => switch (s) {
      'PUBLISHED' => (c: AppColors.good, bg: AppColors.goodSoft),
      'ARCHIVED' => (c: AppColors.muted, bg: AppColors.line),
      _ => (c: AppColors.warn, bg: AppColors.warnSoft),
    };

/// Courses (LMS): list + create a draft. Lessons are managed on the web.
class AdminCoursesScreen extends ConsumerWidget {
  const AdminCoursesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminCoursesProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Courses',
      subtitle: '${items.length} courses',
      icon: Icons.play_lesson_rounded,
      onRefresh: () async => ref.invalidate(adminCoursesProvider),
      fab: FloatingActionButton.extended(
        backgroundColor: AppColors.primary, foregroundColor: Colors.white,
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _CourseForm())),
        icon: const Icon(Icons.add_rounded), label: const Text('New'),
      ),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Text('No courses yet. Tap New to create one.', style: TextStyle(color: AppColors.muted)))
        else
          for (final c in items) ...[
            AppCard(
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => AdminCourseDetailScreen(courseId: c['id'].toString()))),
              child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(c['title']?.toString() ?? '', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text('${c['subject'] ?? ''} · ${c['lessons'] ?? 0} lessons', style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                ])),
                StatusChip(
                  label: (c['status'] as String? ?? 'DRAFT').toLowerCase(),
                  color: _st(c['status'] as String? ?? '').c,
                  bg: _st(c['status'] as String? ?? '').bg,
                ),
              ]),
            ),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _CourseForm extends ConsumerStatefulWidget {
  const _CourseForm();
  @override
  ConsumerState<_CourseForm> createState() => _CourseFormState();
}

class _CourseFormState extends ConsumerState<_CourseForm> {
  final _title = TextEditingController();
  final _summary = TextEditingController();
  bool _saving = false;

  Future<void> _save() async {
    if (_title.text.trim().length < 2) {
      showToast(context, 'Enter a course title.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/courses', {
      'title': _title.text.trim(),
      if (_summary.text.trim().isNotEmpty) 'summary': _summary.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Created.' : 'Could not create.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminCoursesProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'New course',
        subtitle: 'Create a draft course',
        icon: Icons.play_lesson_rounded,
        children: [
          const SectionLabel('Course'),
          AppTextField(controller: _title, label: 'Title', required: true),
          const SizedBox(height: 16),
          AppTextField(controller: _summary, label: 'Summary', hint: 'Optional', maxLines: 3),
          const SizedBox(height: 24),
          PrimaryButton(label: _saving ? 'Creating…' : 'Create course', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
          const SizedBox(height: 8),
          const Center(child: Text('Then open the course to add lessons and publish.',
              style: TextStyle(fontSize: 12, color: AppColors.faint))),
        ],
      );

  @override
  void dispose() {
    _title.dispose(); _summary.dispose();
    super.dispose();
  }
}
