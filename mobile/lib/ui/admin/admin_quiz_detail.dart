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

/// Admin/teacher quiz authoring: status controls + questions (answers shown) +
/// add-question.
class AdminQuizDetailScreen extends ConsumerWidget {
  const AdminQuizDetailScreen({super.key, required this.quizId});
  final String quizId;

  Future<void> _setStatus(WidgetRef ref, BuildContext context, String status) async {
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/quizzes/status', {
      'quizId': quizId, 'status': status,
    });
    if (!context.mounted) return;
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminQuizDetailProvider(quizId)); ref.invalidate(adminQuizzesProvider); }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminQuizDetailProvider(quizId));
    final q = async.value;
    final status = q?['status']?.toString() ?? 'DRAFT';
    final questions = (q?['questions'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canManage = q?['canManage'] == true;

    return DetailScaffold(
      title: q?['title']?.toString() ?? 'Quiz',
      subtitle: q != null ? '${q['subject'] ?? ''} · ${questions.length} questions' : '',
      icon: Icons.quiz_rounded,
      onRefresh: () async => ref.invalidate(adminQuizDetailProvider(quizId)),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (q == null)
          const AppCard(child: Text("Couldn't load this quiz — pull down to retry.", style: TextStyle(color: AppColors.muted)))
        else ...[
          AppCard(child: Row(children: [
            StatusChip(label: status.toLowerCase(), color: _st(status).c, bg: _st(status).bg),
            const Spacer(),
            if (canManage) ...[
              if (status != 'PUBLISHED') _b('Publish', AppColors.good, () => _setStatus(ref, context, 'PUBLISHED')),
              if (status != 'ARCHIVED') _b('Archive', AppColors.muted, () => _setStatus(ref, context, 'ARCHIVED')),
              if (status != 'DRAFT') _b('Draft', AppColors.warn, () => _setStatus(ref, context, 'DRAFT')),
            ],
          ])),
          const SizedBox(height: 16),
          Row(children: [
            const Expanded(child: SectionLabel('Questions')),
            if (canManage)
              TextButton.icon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => _QuestionForm(quizId: quizId))),
                icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Add question'),
              ),
          ]),
          if (questions.isEmpty)
            const AppCard(child: Text('No questions yet. Add at least one, then publish.', style: TextStyle(color: AppColors.muted)))
          else
            for (final qn in questions)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${qn['sequence']}. ${qn['prompt']}   (${qn['points']} pts)',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  for (int i = 0; i < (qn['options'] as List? ?? const []).length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(children: [
                        Icon(i == (qn['correctOption'] as num?)?.toInt()
                                ? Icons.check_circle_rounded : Icons.circle_outlined,
                            size: 16, color: i == (qn['correctOption'] as num?)?.toInt() ? AppColors.good : AppColors.faint),
                        const SizedBox(width: 8),
                        Expanded(child: Text((qn['options'] as List)[i].toString(),
                            style: TextStyle(fontSize: 13,
                                color: i == (qn['correctOption'] as num?)?.toInt() ? AppColors.good : AppColors.ink,
                                fontWeight: i == (qn['correctOption'] as num?)?.toInt() ? FontWeight.w700 : FontWeight.w400))),
                      ]),
                    ),
                  if ((qn['explanation']?.toString() ?? '').isNotEmpty)
                    Padding(padding: const EdgeInsets.only(top: 4),
                        child: Text('Why: ${qn['explanation']}', style: const TextStyle(fontSize: 12, color: AppColors.muted))),
                ])),
              ),
        ],
      ],
    );
  }

  Widget _b(String label, Color color, VoidCallback onTap) => Padding(
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

class _QuestionForm extends ConsumerStatefulWidget {
  const _QuestionForm({required this.quizId});
  final String quizId;
  @override
  ConsumerState<_QuestionForm> createState() => _QuestionFormState();
}

class _QuestionFormState extends ConsumerState<_QuestionForm> {
  final _prompt = TextEditingController();
  final _explain = TextEditingController();
  final _points = TextEditingController(text: '10');
  final _opts = [TextEditingController(), TextEditingController(), TextEditingController(), TextEditingController()];
  int _correct = 0;
  bool _saving = false;

  Future<void> _save() async {
    final options = _opts.map((c) => c.text.trim()).toList();
    if (_prompt.text.trim().length < 2) { showToast(context, 'Enter the question.', error: true); return; }
    if (options.where((o) => o.isNotEmpty).length < 2) { showToast(context, 'Give at least two options.', error: true); return; }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/quizzes/question', {
      'quizId': widget.quizId,
      'prompt': _prompt.text.trim(),
      'options': options,
      'correctOption': _correct,
      'points': int.tryParse(_points.text.trim()) ?? 10,
      if (_explain.text.trim().isNotEmpty) 'explanation': _explain.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) { ref.invalidate(adminQuizDetailProvider(widget.quizId)); Navigator.of(context).maybePop(); }
  }

  @override
  Widget build(BuildContext context) => DetailScaffold(
        title: 'Add question', subtitle: 'Multiple choice', icon: Icons.add_rounded,
        children: [
          AppTextField(controller: _prompt, label: 'Question', required: true, maxLines: 2),
          const SizedBox(height: 14),
          const SectionLabel('Options — tap the circle to mark the correct one'),
          for (int i = 0; i < 4; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(children: [
                IconButton(
                  onPressed: () => setState(() => _correct = i),
                  icon: Icon(_correct == i ? Icons.check_circle_rounded : Icons.circle_outlined,
                      color: _correct == i ? AppColors.good : AppColors.faint),
                ),
                Expanded(child: AppTextField(controller: _opts[i], label: 'Option ${i + 1}${i < 2 ? '' : ' (optional)'}')),
              ]),
            ),
          const SizedBox(height: 4),
          AppTextField(controller: _points, label: 'Points', keyboard: TextInputType.number),
          const SizedBox(height: 14),
          AppTextField(controller: _explain, label: 'Explanation', hint: 'Optional', maxLines: 2),
          const SizedBox(height: 22),
          PrimaryButton(label: _saving ? 'Adding…' : 'Add question', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        ],
      );

  @override
  void dispose() {
    _prompt.dispose(); _explain.dispose(); _points.dispose();
    for (final c in _opts) { c.dispose(); }
    super.dispose();
  }
}
