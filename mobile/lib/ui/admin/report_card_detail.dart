import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

/// One report card in full — the document itself, not the "published" flag the
/// list screen can show. This is what a parent asks about on the phone.
class ReportCardDetailScreen extends ConsumerWidget {
  const ReportCardDetailScreen({super.key, required this.cardId, required this.student});
  final String cardId;
  final String student;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(reportCardProvider(cardId));
    final data = async.value;
    final card = (data?['card'] as Map?)?.cast<String, dynamic>();
    final pupil = (data?['student'] as Map?)?.cast<String, dynamic>();
    final scholastic = (data?['scholastic'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final co = (data?['coScholastic'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: pupil?['name']?.toString() ?? student,
      subtitle: card == null ? 'Loading…' : '${card['term']} · ${card['year']}',
      icon: Icons.description_rounded,
      onRefresh: () async => ref.invalidate(reportCardProvider(cardId)),
      children: [
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (card == null || pupil == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't load this report card — pull down to retry.",
                    style: TextStyle(color: AppColors.muted)),
              ),
            ]),
          )
        else ...[
          AppCard(
            child: Column(children: [
              _Fact('Admission no.', pupil['admissionNo']?.toString() ?? '—'),
              _Fact('Class', pupil['className']?.toString() ?? '—'),
              if (pupil['rollNumber'] != null)
                _Fact('Roll', pupil['rollNumber'].toString()),
              if (pupil['classTeacher'] != null)
                _Fact('Class teacher', pupil['classTeacher'].toString()),
            ]),
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.35,
            children: [
              StatTile(
                icon: Icons.percent_rounded,
                value: card['percentage'] == null
                    ? '—'
                    : '${(card['percentage'] as num).toStringAsFixed(1)}%',
                label: card['obtainedMarks'] == null
                    ? 'Overall'
                    : '${card['obtainedMarks']} of ${card['totalMarks']}',
                color: AppColors.primary,
              ),
              StatTile(
                icon: Icons.workspace_premium_rounded,
                value: card['grade']?.toString() ?? '—',
                label: card['rank'] != null ? 'Rank ${card['rank']}' : 'Grade',
                color: AppColors.gold,
              ),
              StatTile(
                icon: Icons.fact_check_rounded,
                value: card['attendancePercent'] == null
                    ? '—'
                    : '${(card['attendancePercent'] as num).toStringAsFixed(0)}%',
                label: card['attendanceTotal'] == null
                    ? 'Attendance'
                    : '${card['attendancePresent']} of ${card['attendanceTotal']} days',
                color: AppColors.teal,
              ),
              StatTile(
                icon: card['isPublished'] == true
                    ? Icons.visibility_rounded
                    : Icons.visibility_off_rounded,
                value: card['isPublished'] == true ? 'Published' : 'Draft',
                label: card['isPublished'] == true
                    ? 'The family can see it'
                    : 'Not visible to the family',
                color: card['isPublished'] == true ? AppColors.good : AppColors.muted,
              ),
            ],
          ),
          if (scholastic.isNotEmpty) ...[
            const SizedBox(height: 20),
            const SectionLabel('Subjects'),
            AppCard(
              child: Column(children: [
                for (var i = 0; i < scholastic.length; i++) ...[
                  if (i > 0) const Hairline(),
                  _SubjectRow(scholastic[i]),
                ],
              ]),
            ),
          ],
          if (co.isNotEmpty) ...[
            const SizedBox(height: 20),
            const SectionLabel('Co-scholastic'),
            AppCard(
              child: Column(children: [
                for (var i = 0; i < co.length; i++) ...[
                  if (i > 0) const Hairline(),
                  RowTile(
                    title: co[i]['subject']?.toString() ?? '',
                    subtitle: co[i]['remarks']?.toString(),
                    trailing: Text(co[i]['grade']?.toString() ?? '—',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                  ),
                ],
              ]),
            ),
          ],
          if ((card['remarks'] as String?)?.isNotEmpty == true) ...[
            const SizedBox(height: 20),
            const SectionLabel('Remarks'),
            AppCard(
              child: Text(card['remarks'].toString(),
                  style: const TextStyle(fontSize: 13.5, height: 1.5, color: AppColors.muted)),
            ),
          ],
        ],
      ],
    );
  }
}

class _SubjectRow extends StatelessWidget {
  const _SubjectRow(this.line);
  final Map<String, dynamic> line;

  @override
  Widget build(BuildContext context) {
    final obtained = line['obtainedMarks'];
    final max = line['maxMarks'];
    final percent = line['percentage'] as num?;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(line['subject']?.toString() ?? '',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            ),
            Text(
              obtained == null ? 'Not marked' : '$obtained / $max',
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 34,
              child: Text(line['grade']?.toString() ?? '',
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.primary)),
            ),
          ]),
          if (percent != null) ...[
            const SizedBox(height: 8),
            ProgressBar(
              value: (percent / 100).clamp(0, 1).toDouble(),
              color: percent >= 60
                  ? AppColors.good
                  : percent >= 40
                      ? AppColors.warn
                      : AppColors.danger,
            ),
          ],
          if (line['remarks'] != null) ...[
            const SizedBox(height: 6),
            Text(line['remarks'].toString(),
                style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ],
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(children: [
          Expanded(
            child: Text(label, style: const TextStyle(fontSize: 13.5, color: AppColors.muted)),
          ),
          Flexible(
            child: Text(value,
                textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
          ),
        ]),
      );
}
