import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

({Color c, Color bg}) _st(String s) => switch (s) {
      'PUBLISHED' => (c: AppColors.good, bg: AppColors.goodSoft),
      'ARCHIVED' => (c: AppColors.muted, bg: AppColors.line),
      _ => (c: AppColors.warn, bg: AppColors.warnSoft),
    };

/// Admin/teacher course authoring: status controls (publish/unpublish/archive),
/// lessons, add-lesson and add-resource.
class AdminCourseDetailScreen extends ConsumerWidget {
  const AdminCourseDetailScreen({super.key, required this.courseId});
  final String courseId;

  Future<void> _setStatus(WidgetRef ref, BuildContext context, String status) async {
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/courses/status', {
      'courseId': courseId, 'status': status,
    });
    if (!context.mounted) return;
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminCourseDetailProvider(courseId));
      ref.invalidate(adminCoursesProvider);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminCourseDetailProvider(courseId));
    final c = async.value;
    final status = c?['status']?.toString() ?? 'DRAFT';
    final lessons = (c?['lessons'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = c?['canManage'] == true;
    final canPublish = c?['canPublish'] == true;

    return DetailScaffold(
      title: c?['title']?.toString() ?? 'Course',
      subtitle: c != null ? '${c['subject'] ?? ''} · ${lessons.length} lessons' : '',
      icon: Icons.play_lesson_rounded,
      onRefresh: () async => ref.invalidate(adminCourseDetailProvider(courseId)),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (c == null)
          const AppCard(child: Text("Couldn't load this course — pull down to retry.", style: TextStyle(color: AppColors.muted)))
        else ...[
          AppCard(child: Row(children: [
            StatusChip(label: status.toLowerCase(), color: _st(status).c, bg: _st(status).bg),
            const Spacer(),
            if (canManage) ...[
              if (status != 'PUBLISHED' && canPublish)
                _StatusBtn('Publish', AppColors.good, () => _setStatus(ref, context, 'PUBLISHED')),
              if (status == 'PUBLISHED')
                _StatusBtn('Unpublish', AppColors.warn, () => _setStatus(ref, context, 'DRAFT')),
              if (status != 'ARCHIVED')
                _StatusBtn('Archive', AppColors.muted, () => _setStatus(ref, context, 'ARCHIVED'))
              else
                _StatusBtn('Restore', AppColors.primary, () => _setStatus(ref, context, 'DRAFT')),
            ],
          ])),
          if ((c['description']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            AppCard(child: Text(c['description'].toString(), style: const TextStyle(height: 1.4))),
          ],
          const SizedBox(height: 16),
          Row(children: [
            const Expanded(child: SectionLabel('Lessons')),
            if (canManage)
              TextButton.icon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => _LessonForm(courseId: courseId))),
                icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Add lesson'),
              ),
          ]),
          if (lessons.isEmpty)
            const AppCard(child: Text('No lessons yet. Add one, then publish.', style: TextStyle(color: AppColors.muted)))
          else
            for (final l in lessons)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Lesson ${l['sequence']} · ${l['title']}', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                  if ((l['content']?.toString() ?? '').isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(l['content'].toString(), maxLines: 3, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.35)),
                  ],
                  Text('${(l['resources'] as List?)?.length ?? 0} resources'
                      '${l['durationMinutes'] != null ? ' · ${l['durationMinutes']}m' : ''}',
                      style: const TextStyle(fontSize: 11.5, color: AppColors.faint)),
                ])),
              ),
          if (canManage) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => _ResourceForm(courseId: courseId))),
              icon: const Icon(Icons.attach_file_rounded, size: 18),
              label: const Text('Attach a course resource'),
            ),
          ],
        ],
      ],
    );
  }
}

class _StatusBtn extends StatelessWidget {
  const _StatusBtn(this.label, this.color, this.onTap);
  final String label; final Color color; final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 8),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(AppRadius.pill)),
            child: Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: color)),
          ),
        ),
      );
}

class _LessonForm extends ConsumerStatefulWidget {
  const _LessonForm({required this.courseId});
  final String courseId;
  @override
  ConsumerState<_LessonForm> createState() => _LessonFormState();
}

class _LessonFormState extends ConsumerState<_LessonForm> {
  final _title = TextEditingController();
  final _content = TextEditingController();
  final _video = TextEditingController();
  final _mins = TextEditingController();
  bool _saving = false;

  Future<void> _save() async {
    if (_title.text.trim().length < 2) { showToast(context, 'Enter a lesson title.', error: true); return; }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/courses/lesson', {
      'courseId': widget.courseId,
      'title': _title.text.trim(),
      if (_content.text.trim().isNotEmpty) 'content': _content.text.trim(),
      if (_video.text.trim().isNotEmpty) 'videoUrl': _video.text.trim(),
      if (_mins.text.trim().isNotEmpty) 'durationMinutes': _mins.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminCourseDetailProvider(widget.courseId)); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'Add lesson', subtitle: 'New course lesson', icon: Icons.add_rounded,
        children: [
          AppTextField(controller: _title, label: 'Title', required: true),
          const SizedBox(height: 14),
          AppTextField(controller: _content, label: 'Content', hint: 'Lesson text (optional)', maxLines: 6),
          const SizedBox(height: 14),
          AppTextField(controller: _video, label: 'Video URL', hint: 'https:// (optional)'),
          const SizedBox(height: 14),
          AppTextField(controller: _mins, label: 'Duration (minutes)', hint: 'optional', keyboard: TextInputType.number),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Adding…' : 'Add lesson', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() { _title.dispose(); _content.dispose(); _video.dispose(); _mins.dispose(); super.dispose(); }
}

class _ResourceForm extends ConsumerStatefulWidget {
  const _ResourceForm({required this.courseId});
  final String courseId;
  @override
  ConsumerState<_ResourceForm> createState() => _ResourceFormState();
}

class _ResourceFormState extends ConsumerState<_ResourceForm> {
  final _title = TextEditingController();
  final _url = TextEditingController();
  String _type = 'LINK';
  bool _saving = false;

  Future<void> _save() async {
    if (_title.text.trim().length < 2 || _url.text.trim().isEmpty) {
      showToast(context, 'Enter a title and URL.', error: true); return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/courses/resource', {
      'courseId': widget.courseId, 'title': _title.text.trim(), 'type': _type, 'url': _url.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminCourseDetailProvider(widget.courseId)); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'Attach resource', subtitle: 'Link or file', icon: Icons.attach_file_rounded,
        children: [
          AppTextField(controller: _title, label: 'Title', required: true),
          const SizedBox(height: 14),
          AppDropdown<String>(
            label: 'Type', value: _type,
            items: const ['LINK', 'PDF', 'VIDEO', 'DOCUMENT', 'IMAGE', 'OTHER'],
            itemLabel: (t) => t[0] + t.substring(1).toLowerCase(),
            onChanged: (t) => setState(() => _type = t ?? 'LINK'),
          ),
          const SizedBox(height: 14),
          AppTextField(controller: _url, label: 'URL', hint: 'https://', required: true),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Attaching…' : 'Attach', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() { _title.dispose(); _url.dispose(); super.dispose(); }
}
