import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'edit_student.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// Rich student profile mirroring the website's detail page: headline stats
/// (attendance, average score, fees, library), guardian, recent marks, and an
/// Edit / promote action.
class StudentDetailScreen extends ConsumerStatefulWidget {
  const StudentDetailScreen({super.key, required this.studentId});
  final String studentId;
  @override
  ConsumerState<StudentDetailScreen> createState() => _StudentDetailScreenState();
}

class _StudentDetailScreenState extends ConsumerState<StudentDetailScreen> {
  int _reload = 0;
  late Future<Map<String, dynamic>?> _future = _load();

  Future<Map<String, dynamic>?> _load() =>
      ref.read(apiProvider).getJson('/api/mobile/v1/admin/student/${widget.studentId}');

  void _refresh() => setState(() {
        _reload++;
        _future = _load();
      });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>?>(
      key: ValueKey(_reload),
      future: _future,
      builder: (context, snap) {
        final d = snap.data;
        final stats = (d?['stats'] as Map?)?.cast<String, dynamic>() ?? const {};
        final marks = (d?['recentMarks'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        final guardian = (d?['guardian'] as Map?)?.cast<String, dynamic>();

        return DetailScaffold(
          title: d == null ? 'Student' : '${d['firstName']} ${d['lastName'] ?? ''}'.trim(),
          subtitle: d == null ? '' : '${d['admissionNo'] ?? ''} · ${d['className'] ?? ''}',
          icon: Icons.school_rounded,
          onRefresh: () async => _refresh(),
          children: [
            if (snap.connectionState == ConnectionState.waiting)
              const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
            else if (d == null)
              const AppCard(child: Text("Couldn't load this student.", style: TextStyle(color: AppColors.muted)))
            else ...[
              Row(children: [
                StatusChip(
                  label: (d['status'] as String? ?? '').toLowerCase(),
                  color: d['status'] == 'ACTIVE' ? AppColors.good : AppColors.muted,
                  bg: d['status'] == 'ACTIVE' ? AppColors.goodSoft : AppColors.line,
                ),
                const Spacer(),
                PrimaryButton(
                  label: 'Edit / promote',
                  icon: Icons.edit_rounded,
                  expand: false,
                  onPressed: () async {
                    await Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => EditStudentScreen(studentId: widget.studentId)));
                    _refresh();
                  },
                ),
              ]),
              const SizedBox(height: 18),
              Row(children: [
                Expanded(child: _StatCard(
                  label: 'Attendance',
                  value: stats['attendancePercent'] == null ? '—' : '${stats['attendancePercent']}%',
                  sub: '${stats['attendancePresent'] ?? 0} of ${stats['attendanceTotal'] ?? 0} sessions',
                  color: AppColors.teal,
                )),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(
                  label: 'Average score',
                  value: stats['averageScore'] == null ? '—' : '${stats['averageScore']}%',
                  sub: '${stats['assessments'] ?? 0} assessments',
                  color: AppColors.primary,
                )),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _StatCard(
                  label: 'Fees outstanding',
                  value: _inr.format((stats['feesOutstanding'] ?? 0) as num),
                  sub: (stats['feesOutstanding'] ?? 0) == 0 ? 'All settled' : 'Due',
                  color: (stats['feesOutstanding'] ?? 0) == 0 ? AppColors.good : AppColors.danger,
                )),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(
                  label: 'Library',
                  value: '${stats['booksOnLoan'] ?? 0}',
                  sub: 'books on loan',
                  color: AppColors.gold,
                )),
              ]),
              const SizedBox(height: 22),
              if (guardian != null) ...[
                const SectionLabel('Guardian'),
                AppCard(child: Row(children: [
                  const Icon(Icons.family_restroom_rounded, color: AppColors.muted),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(guardian['name']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('${guardian['relationship'] ?? ''} · ${guardian['phone'] ?? ''}',
                        style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                  ])),
                ])),
                const SizedBox(height: 22),
              ],
              const SectionLabel('Recent marks'),
              if (marks.isEmpty)
                const AppCard(child: Text('No marks recorded yet.', style: TextStyle(color: AppColors.muted)))
              else
                AppCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Column(children: [
                    for (var i = 0; i < marks.length; i++) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(children: [
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(marks[i]['subject']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text(marks[i]['exam']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                          ])),
                          Text(marks[i]['score']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                        ]),
                      ),
                      if (i < marks.length - 1) const Hairline(),
                    ],
                  ]),
                ),
            ],
          ],
        );
      },
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.sub, required this.color});
  final String label;
  final String value;
  final String sub;
  final Color color;
  @override
  Widget build(BuildContext context) => AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: eyebrow(AppColors.muted)),
          const SizedBox(height: 6),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 2),
          Text(sub, style: const TextStyle(fontSize: 11.5, color: AppColors.faint)),
        ]),
      );
}
