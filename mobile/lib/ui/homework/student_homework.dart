import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _due = DateFormat('d MMM');

({Color c, Color bg, String label}) _statusStyle(String s) => switch (s) {
      'SUBMITTED' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Submitted'),
      'LATE' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Submitted late'),
      'GRADED' => (c: AppColors.primary, bg: AppColors.accentSoft, label: 'Graded'),
      'MISSING' => (c: AppColors.danger, bg: AppColors.dangerSoft, label: 'Missing'),
      'RESUBMIT' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Resubmit'),
      _ => (c: AppColors.muted, bg: AppColors.line, label: 'To do'),
    };

/// The child's homework, live from the server, with the ability to turn in a
/// written answer and see marks/feedback once graded.
class StudentHomeworkScreen extends ConsumerWidget {
  const StudentHomeworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(studentHomeworkProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final offline = !async.isLoading && async.value == null;
    final pending = items.where((h) => h['status'] == 'ASSIGNED' || h['status'] == 'RESUBMIT').length;

    return DetailScaffold(
      title: 'Homework',
      subtitle: offline ? 'Not loaded' : '$pending to do · ${items.length} total',
      icon: Icons.menu_book_rounded,
      onRefresh: () async => ref.invalidate(studentHomeworkProvider),
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
              Expanded(child: Text('No homework assigned yet.', style: TextStyle(color: AppColors.muted))),
            ]),
          )
        else
          for (final h in items) ...[
            _HomeworkCard(h: h),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard({required this.h});
  final Map<String, dynamic> h;

  @override
  Widget build(BuildContext context) {
    final status = (h['status'] as String?) ?? 'ASSIGNED';
    final st = _statusStyle(status);
    final due = DateTime.tryParse(h['dueOn']?.toString() ?? '');
    final marks = h['marksObtained'];
    final maxMarks = h['maxMarks'];
    return AppCard(
      onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => HomeworkDetailScreen(h: h))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(h['title']?.toString() ?? '',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
              StatusChip(label: st.label, color: st.c, bg: st.bg),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${h['subject'] ?? ''}${due != null ? ' · due ${_due.format(due)}' : ''}',
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          if (status == 'GRADED' && marks != null) ...[
            const SizedBox(height: 8),
            Text('Scored $marks${maxMarks != null ? ' / $maxMarks' : ''}',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.primary)),
          ],
        ],
      ),
    );
  }
}

/// Detail + submit. The student writes an answer; once graded it shows the mark
/// and the teacher's feedback (read-only).
class HomeworkDetailScreen extends ConsumerStatefulWidget {
  const HomeworkDetailScreen({super.key, required this.h});
  final Map<String, dynamic> h;
  @override
  ConsumerState<HomeworkDetailScreen> createState() => _HomeworkDetailScreenState();
}

class _HomeworkDetailScreenState extends ConsumerState<HomeworkDetailScreen> {
  late final TextEditingController _answer =
      TextEditingController(text: widget.h['content']?.toString() ?? '');
  bool _saving = false;

  Future<void> _submit() async {
    if (_answer.text.trim().isEmpty) {
      showToast(context, 'Write your answer first.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/parent/homework/submit', {
      'submissionId': widget.h['submissionId'],
      'homeworkId': widget.h['homeworkId'],
      'content': _answer.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Submitted.' : 'Could not submit.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(studentHomeworkProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.h;
    final status = (h['status'] as String?) ?? 'ASSIGNED';
    final graded = status == 'GRADED';
    final due = DateTime.tryParse(h['dueOn']?.toString() ?? '');

    return DetailScaffold(
      title: h['title']?.toString() ?? 'Homework',
      subtitle: '${h['subject'] ?? ''}${due != null ? ' · due ${_due.format(due)}' : ''}',
      icon: Icons.menu_book_rounded,
      children: [
        if ((h['description']?.toString() ?? '').isNotEmpty) ...[
          const SectionLabel('Task'),
          AppCard(child: Text(h['description'].toString(), style: const TextStyle(height: 1.4))),
          const SizedBox(height: 18),
        ],
        if (graded) ...[
          const SectionLabel('Result'),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  h['marksObtained'] != null
                      ? 'Scored ${h['marksObtained']}${h['maxMarks'] != null ? ' / ${h['maxMarks']}' : ''}'
                      : 'Graded',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.primary),
                ),
                if ((h['feedback']?.toString() ?? '').isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text('Feedback: ${h['feedback']}', style: const TextStyle(color: AppColors.muted, height: 1.4)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
          const SectionLabel('Your answer'),
          AppCard(child: Text(h['content']?.toString() ?? '—', style: const TextStyle(height: 1.4))),
        ] else ...[
          const SectionLabel('Your answer'),
          AppTextField(controller: _answer, label: 'Write your answer', maxLines: 8),
          const SizedBox(height: 20),
          PrimaryButton(
            label: _saving ? 'Submitting…' : (status == 'ASSIGNED' ? 'Submit homework' : 'Update submission'),
            icon: Icons.send_rounded,
            onPressed: _saving ? null : _submit,
          ),
        ],
      ],
    );
  }

  @override
  void dispose() {
    _answer.dispose();
    super.dispose();
  }
}
