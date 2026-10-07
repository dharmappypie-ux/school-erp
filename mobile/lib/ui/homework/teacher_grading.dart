import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _due = DateFormat('d MMM');

/// The teacher's homework with a to-grade queue. Tap one to see submissions.
class TeacherHomeworkScreen extends ConsumerWidget {
  const TeacherHomeworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(teacherHomeworkProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final offline = !async.isLoading && async.value == null;

    return DetailScaffold(
      title: 'Homework',
      subtitle: offline ? 'Not loaded' : '${items.length} assignments',
      icon: Icons.fact_check_rounded,
      onRefresh: () async => ref.invalidate(teacherHomeworkProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(child: Text("Couldn't reach the school — pull down to retry.",
                  style: TextStyle(color: AppColors.muted))),
            ]),
          )
        else if (items.isEmpty)
          const AppCard(
            child: Row(children: [
              Icon(Icons.inbox_rounded, color: AppColors.faint),
              SizedBox(width: 12),
              Expanded(child: Text('You haven\'t set any homework yet.', style: TextStyle(color: AppColors.muted))),
            ]),
          )
        else
          for (final h in items) ...[
            _HwRow(h: h),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _HwRow extends StatelessWidget {
  const _HwRow({required this.h});
  final Map<String, dynamic> h;
  @override
  Widget build(BuildContext context) {
    final toGrade = (h['toGrade'] as num?)?.toInt() ?? 0;
    final graded = (h['graded'] as num?)?.toInt() ?? 0;
    final total = (h['total'] as num?)?.toInt() ?? 0;
    final due = DateTime.tryParse(h['dueOn']?.toString() ?? '');
    return AppCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => SubmissionsScreen(homeworkId: h['id'].toString(), title: h['title']?.toString() ?? ''))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(h['title']?.toString() ?? '',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
              if (toGrade > 0)
                StatusChip(label: '$toGrade to grade', color: AppColors.warn, bg: AppColors.warnSoft)
              else
                StatusChip(label: 'All graded', color: AppColors.good, bg: AppColors.goodSoft),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${h['subject'] ?? ''} · ${h['className'] ?? ''}${due != null ? ' · due ${_due.format(due)}' : ''}',
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 6),
          Text('$graded graded · $total students',
              style: const TextStyle(fontSize: 12, color: AppColors.faint)),
        ],
      ),
    );
  }
}

/// All submissions for one homework. Tap a submitted one to grade it.
class SubmissionsScreen extends ConsumerWidget {
  const SubmissionsScreen({super.key, required this.homeworkId, required this.title});
  final String homeworkId;
  final String title;

  ({Color c, Color bg, String label}) _style(String s) => switch (s) {
        'SUBMITTED' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Submitted'),
        'LATE' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Late'),
        'GRADED' => (c: AppColors.primary, bg: AppColors.accentSoft, label: 'Graded'),
        _ => (c: AppColors.muted, bg: AppColors.line, label: 'Not in'),
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(homeworkSubmissionsProvider(homeworkId));
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final maxMarks = async.value?['homework']?['maxMarks'];
    final offline = !async.isLoading && async.value == null;
    final waiting = items.where((s) => s['status'] == 'SUBMITTED' || s['status'] == 'LATE').length;

    return DetailScaffold(
      title: title.isEmpty ? 'Submissions' : title,
      subtitle: offline ? 'Not loaded' : '$waiting to grade · ${items.length} students',
      icon: Icons.assignment_turned_in_rounded,
      onRefresh: () async => ref.invalidate(homeworkSubmissionsProvider(homeworkId)),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(child: Text("Couldn't reach the school — pull down to retry.",
                  style: TextStyle(color: AppColors.muted))),
            ]),
          )
        else
          for (final s in items) ...[
            _SubRow(s: s, maxMarks: maxMarks, style: _style((s['status'] as String?) ?? ''),
                homeworkId: homeworkId),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _SubRow extends StatelessWidget {
  const _SubRow({required this.s, required this.maxMarks, required this.style, required this.homeworkId});
  final Map<String, dynamic> s;
  final dynamic maxMarks;
  final ({Color c, Color bg, String label}) style;
  final String homeworkId;

  @override
  Widget build(BuildContext context) {
    final status = (s['status'] as String?) ?? '';
    final canGrade = status == 'SUBMITTED' || status == 'LATE' || status == 'GRADED';
    return AppCard(
      onTap: canGrade
          ? () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => GradeScreen(s: s, maxMarks: maxMarks, homeworkId: homeworkId)))
          : null,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s['studentName']?.toString() ?? '',
                    style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                if (status == 'GRADED' && s['marksObtained'] != null) ...[
                  const SizedBox(height: 2),
                  Text('${s['marksObtained']}${maxMarks != null ? ' / $maxMarks' : ''}',
                      style: const TextStyle(fontSize: 12.5, color: AppColors.primary, fontWeight: FontWeight.w700)),
                ],
              ],
            ),
          ),
          StatusChip(label: style.label, color: style.c, bg: style.bg),
          if (canGrade) const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
        ],
      ),
    );
  }
}

/// Read one answer and record a mark + feedback.
class GradeScreen extends ConsumerStatefulWidget {
  const GradeScreen({super.key, required this.s, required this.maxMarks, required this.homeworkId});
  final Map<String, dynamic> s;
  final dynamic maxMarks;
  final String homeworkId;
  @override
  ConsumerState<GradeScreen> createState() => _GradeScreenState();
}

class _GradeScreenState extends ConsumerState<GradeScreen> {
  late final TextEditingController _marks =
      TextEditingController(text: widget.s['marksObtained']?.toString() ?? '');
  late final TextEditingController _feedback =
      TextEditingController(text: widget.s['feedback']?.toString() ?? '');
  bool _saving = false;

  Future<void> _grade() async {
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/teacher/homework/grade', {
      'submissionId': widget.s['submissionId'],
      if (_marks.text.trim().isNotEmpty) 'marks': _marks.text.trim(),
      if (_feedback.text.trim().isNotEmpty) 'feedback': _feedback.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Graded.' : 'Could not grade.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(homeworkSubmissionsProvider(widget.homeworkId));
      ref.invalidate(teacherHomeworkProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.s;
    final answer = s['content']?.toString() ?? '';
    return DetailScaffold(
      title: s['studentName']?.toString() ?? 'Submission',
      subtitle: widget.maxMarks != null ? 'Out of ${widget.maxMarks}' : 'Feedback only',
      icon: Icons.grading_rounded,
      children: [
        const SectionLabel('Answer'),
        AppCard(
          child: Text(answer.isEmpty ? 'No written answer submitted.' : answer,
              style: TextStyle(height: 1.4, color: answer.isEmpty ? AppColors.muted : AppColors.ink)),
        ),
        const SizedBox(height: 20),
        const SectionLabel('Grade'),
        if (widget.maxMarks != null)
          AppTextField(controller: _marks, label: 'Marks (out of ${widget.maxMarks})', keyboard: TextInputType.number),
        if (widget.maxMarks != null) const SizedBox(height: 16),
        AppTextField(controller: _feedback, label: 'Feedback', hint: 'Optional', maxLines: 4),
        const SizedBox(height: 22),
        PrimaryButton(
          label: _saving ? 'Saving…' : 'Save grade',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _grade,
        ),
      ],
    );
  }

  @override
  void dispose() {
    _marks.dispose();
    _feedback.dispose();
    super.dispose();
  }
}
