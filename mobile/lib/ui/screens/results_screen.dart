import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

class ResultsScreen extends ConsumerWidget {
  const ResultsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final results = ref.watch(resultsProvider);
    final student = ref.watch(studentProvider).value;

    return DetailScaffold(
      title: 'Results',
      subtitle: 'Half-yearly term · ${student?.className ?? ''}',
      icon: Icons.insights_rounded,
      onRefresh: () async {
        await ref.read(syncProvider).sync(manual: true);
        refreshData(ref);
      },
      hero: _hero(student, results.value ?? const []),
      children: [
        const SectionLabel('Subjects'),
        results.when(
          loading: () => const _Loading(),
          error: (e, _) => AppCard(child: Text('$e')),
          data: (list) => Column(
            children: [for (final s in list) _SubjectCard(s)],
          ),
        ),
      ],
    );
  }

  Widget _hero(Student? s, List<SubjectResult> list) {
    final avg = s?.avgPercent ??
        (list.isEmpty ? 0 : (list.map((e) => e.fraction * 100).reduce((a, b) => a + b) / list.length).round());
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('TERM AVERAGE', style: eyebrow(Colors.white.withValues(alpha: 0.85))),
              const SizedBox(height: 6),
              Text('$avg%',
                  style: const TextStyle(
                      color: Colors.white, fontSize: 40, fontWeight: FontWeight.w800, height: 1)),
              const SizedBox(height: 6),
              Text('${list.length} subjects · ${_topGrade(list)} overall',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5)),
            ],
          ),
        ),
        if (s != null && s.trend.isNotEmpty)
          SizedBox(width: 120, child: Sparkline(s.trend, color: Colors.white)),
      ],
    );
  }

  String _topGrade(List<SubjectResult> list) {
    if (list.isEmpty) return '—';
    final avg = list.map((e) => e.fraction).reduce((a, b) => a + b) / list.length;
    if (avg >= 0.9) return 'A+';
    if (avg >= 0.8) return 'A';
    if (avg >= 0.7) return 'B+';
    if (avg >= 0.6) return 'B';
    return 'C';
  }
}

class _SubjectCard extends StatelessWidget {
  const _SubjectCard(this.s);
  final SubjectResult s;

  @override
  Widget build(BuildContext context) {
    final color = s.fraction >= 0.85
        ? AppColors.good
        : s.fraction >= 0.7
            ? AppColors.teal
            : AppColors.warn;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(s.subject,
                      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700)),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(AppRadius.pill)),
                  child: Text(s.grade,
                      style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12.5)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: ProgressBar(value: s.fraction, color: color)),
                const SizedBox(width: 12),
                Text('${s.marks}/${s.maxMarks}',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) =>
      const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()));
}
