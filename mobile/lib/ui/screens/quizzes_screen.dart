import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Published quizzes for the child's class — available to take and completed
/// with scores. Mobile mirror of /portal/quizzes.
class QuizzesScreen extends ConsumerWidget {
  const QuizzesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(parentQuizzesProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final points = (async.value?['points'] as num?)?.toInt() ?? 0;
    final offline = !async.isLoading && async.value == null;
    final available = items.where((q) => q['status'] == 'available').toList();
    final completed = items.where((q) => q['status'] == 'completed').toList();
    final closed = items.where((q) => q['status'] == 'closed').toList();

    return DetailScaffold(
      title: 'Quizzes',
      subtitle: 'Build your knowledge',
      icon: Icons.quiz_rounded,
      onRefresh: () async => ref.invalidate(parentQuizzesProvider),
      hero: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('POINTS EARNED', style: eyebrow(Colors.white.withValues(alpha: 0.85))),
          const SizedBox(height: 6),
          Text('$points',
              style: const TextStyle(
                  color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800, height: 1)),
        ],
      ),
      children: [
        if (async.isLoading)
          const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(child: Text("Couldn't reach the school — pull down to retry.",
              style: TextStyle(color: AppColors.muted)))
        else if (items.isEmpty)
          const AppCard(child: Text('No quizzes published for your class yet.',
              style: TextStyle(color: AppColors.muted)))
        else ...[
          if (available.isNotEmpty) ...[
            const SectionLabel('Available now'),
            for (final q in available) _QuizCard(q, open: true),
          ],
          if (completed.isNotEmpty) ...[
            const SizedBox(height: 8),
            const SectionLabel('Completed'),
            for (final q in completed) _QuizCard(q, open: false),
          ],
          if (closed.isNotEmpty) ...[
            const SizedBox(height: 8),
            const SectionLabel('Closed'),
            for (final q in closed) _QuizCard(q, open: false),
          ],
        ],
      ],
    );
  }
}

class _QuizCard extends StatelessWidget {
  const _QuizCard(this.q, {required this.open});
  final Map<String, dynamic> q;
  final bool open;

  @override
  Widget build(BuildContext context) {
    final status = q['status']?.toString();
    final percent = (q['percent'] as num?)?.toInt();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        onTap: status == 'closed'
            ? null
            : () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => QuizDetailScreen(quizId: q['id'].toString()))),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(q['title']?.toString() ?? '',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(
                    '${q['subject'] ?? ''} · ${q['questions']} questions',
                    style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            if (status == 'completed' && percent != null)
              StatusChip(
                label: '$percent%',
                color: percent >= 60 ? AppColors.good : percent >= 40 ? AppColors.warn : AppColors.danger,
                bg: percent >= 60 ? AppColors.goodSoft : percent >= 40 ? AppColors.warnSoft : AppColors.dangerSoft,
              )
            else if (status == 'available')
              const StatusChip(label: 'Take', color: AppColors.primary, bg: AppColors.accentSoft, icon: Icons.play_arrow_rounded)
            else
              const StatusChip(label: 'Closed', color: AppColors.muted, bg: AppColors.line),
          ],
        ),
      ),
    );
  }
}

/// A quiz: runs the questions if not yet taken, or shows the full review once
/// completed. Mirror of /portal/quizzes/[id].
class QuizDetailScreen extends ConsumerStatefulWidget {
  const QuizDetailScreen({super.key, required this.quizId});
  final String quizId;
  @override
  ConsumerState<QuizDetailScreen> createState() => _QuizDetailScreenState();
}

class _QuizDetailScreenState extends ConsumerState<QuizDetailScreen> {
  final Map<String, int> _answers = {};
  bool _submitting = false;

  Future<void> _submit(Map<String, dynamic> quiz) async {
    final questions = (quiz['questions'] as List).cast<Map<String, dynamic>>();
    if (_answers.length < questions.length) {
      showToast(context, 'Answer every question first.', error: true);
      return;
    }
    setState(() => _submitting = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/parent/quiz/attempt', {
      'quizId': widget.quizId,
      'answers': _answers,
    });
    if (!mounted) return;
    setState(() => _submitting = false);
    if (res.ok) {
      ref.invalidate(parentQuizProvider(widget.quizId));
      ref.invalidate(parentQuizzesProvider);
      showToast(context, res.body?['message']?.toString() ?? 'Submitted.');
    } else {
      showToast(context, res.body?['error']?.toString() ?? 'Could not submit.', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(parentQuizProvider(widget.quizId));
    final quiz = async.value;

    return DetailScaffold(
      title: quiz?['title']?.toString() ?? 'Quiz',
      subtitle: quiz?['subject']?.toString() ?? '',
      icon: Icons.quiz_rounded,
      onRefresh: () async => ref.invalidate(parentQuizProvider(widget.quizId)),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (quiz == null)
          const AppCard(child: Text("Couldn't load this quiz — pull down to retry.",
              style: TextStyle(color: AppColors.muted)))
        else if (quiz['state'] == 'completed')
          ..._review(quiz)
        else if (quiz['state'] == 'available')
          ..._runner(quiz)
        else
          const AppCard(
            child: Row(children: [
              Icon(Icons.lock_clock_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(child: Text('This quiz is closed — it is not open for attempts right now.',
                  style: TextStyle(color: AppColors.muted))),
            ]),
          ),
      ],
    );
  }

  // ---- Results review ----------------------------------------------------
  List<Widget> _review(Map<String, dynamic> quiz) {
    final score = (quiz['score'] as num?)?.toInt() ?? 0;
    final totalPoints = (quiz['totalPoints'] as num?)?.toInt() ?? 0;
    final percent = (quiz['percent'] as num?)?.toInt() ?? 0;
    final correct = (quiz['correct'] as num?)?.toInt() ?? 0;
    final count = (quiz['questionCount'] as num?)?.toInt() ?? 0;
    final passed = quiz['passed'] == true;
    final questions = (quiz['questions'] as List? ?? const []).cast<Map<String, dynamic>>();
    return [
      Row(
        children: [
          Expanded(child: StatTile(icon: Icons.star_rounded, value: '$score/$totalPoints', label: '$percent%',
              color: percent >= 60 ? AppColors.good : percent >= 40 ? AppColors.warn : AppColors.danger)),
          const SizedBox(width: 12),
          Expanded(child: StatTile(icon: Icons.check_circle_rounded, value: '$correct/$count', label: 'Correct',
              color: AppColors.primary)),
        ],
      ),
      const SizedBox(height: 12),
      AppCard(
        child: Row(
          children: [
            Icon(passed ? Icons.celebration_rounded : Icons.refresh_rounded,
                color: passed ? AppColors.good : AppColors.warn),
            const SizedBox(width: 12),
            Text(passed ? 'Passed 🎉' : 'Keep trying',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800,
                    color: passed ? AppColors.good : AppColors.warn)),
          ],
        ),
      ),
      const SizedBox(height: 18),
      const SectionLabel('Review'),
      for (final q in questions) _reviewQuestion(q),
    ];
  }

  Widget _reviewQuestion(Map<String, dynamic> q) {
    final options = (q['options'] as List? ?? const []).cast<dynamic>();
    final correctOption = (q['correctOption'] as num?)?.toInt();
    final chosen = (q['selectedOption'] as num?)?.toInt();
    final awarded = (q['pointsAwarded'] as num?)?.toInt() ?? 0;
    final points = (q['points'] as num?)?.toInt() ?? 0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${q['sequence']}. ${q['prompt']}   ($awarded/$points pts)',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            for (int i = 0; i < options.length; i++) _optionRow(options[i].toString(), i, correctOption, chosen),
            if ((q['explanation']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Why: ${q['explanation']}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.4)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _optionRow(String text, int index, int? correct, int? chosen) {
    final isCorrect = index == correct;
    final isChosen = index == chosen;
    final (Color border, Color bg, Color fg) = isCorrect
        ? (AppColors.good, AppColors.goodSoft, AppColors.good)
        : isChosen
            ? (AppColors.danger, AppColors.dangerSoft, AppColors.danger)
            : (AppColors.line, Colors.transparent, AppColors.muted);
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: border.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          if (isCorrect) const Text('✓ ', style: TextStyle(color: AppColors.good, fontWeight: FontWeight.w800))
          else if (isChosen) const Text('✗ ', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w800)),
          Expanded(child: Text(text, style: TextStyle(fontSize: 13, color: fg))),
          if (isChosen && !isCorrect)
            const Text('your answer', style: TextStyle(fontSize: 11, color: AppColors.danger)),
        ],
      ),
    );
  }

  // ---- Runner ------------------------------------------------------------
  List<Widget> _runner(Map<String, dynamic> quiz) {
    final questions = (quiz['questions'] as List? ?? const []).cast<Map<String, dynamic>>();
    return [
      if ((quiz['description']?.toString() ?? '').isNotEmpty) ...[
        AppCard(child: Text(quiz['description'].toString(), style: const TextStyle(height: 1.4))),
        const SizedBox(height: 12),
      ],
      Text('${_answers.length} of ${questions.length} answered',
          style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
      const SizedBox(height: 10),
      for (final q in questions) _runnerQuestion(q),
      const SizedBox(height: 10),
      PrimaryButton(
        label: _submitting ? 'Submitting…' : 'Submit quiz',
        icon: Icons.send_rounded,
        onPressed: _submitting ? null : () => _submit(quiz),
      ),
    ];
  }

  Widget _runnerQuestion(Map<String, dynamic> q) {
    final id = q['id'].toString();
    final options = (q['options'] as List? ?? const []).cast<dynamic>();
    final selected = _answers[id];
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${q['sequence']}. ${q['prompt']}',
                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            for (int i = 0; i < options.length; i++)
              InkWell(
                onTap: () => setState(() => _answers[id] = i),
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                  decoration: BoxDecoration(
                    color: selected == i ? AppColors.accentSoft : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: selected == i ? AppColors.primary : AppColors.line),
                  ),
                  child: Row(
                    children: [
                      Icon(selected == i ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                          size: 19, color: selected == i ? AppColors.primary : AppColors.faint),
                      const SizedBox(width: 10),
                      Expanded(child: Text(options[i].toString(), style: const TextStyle(fontSize: 13.5))),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
