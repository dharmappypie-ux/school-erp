import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

final _d = DateFormat('EEE, d MMM');

({Color c, Color bg, String label}) _status(String s) => switch (s) {
      'PRESENT' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Present'),
      'ABSENT' => (c: AppColors.danger, bg: AppColors.dangerSoft, label: 'Absent'),
      'LATE' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Late'),
      'ON_LEAVE' || 'EXCUSED' => (c: AppColors.primary, bg: AppColors.accentSoft, label: 'Leave'),
      _ => (c: AppColors.muted, bg: AppColors.line, label: s.toLowerCase()),
    };

/// A student's attendance history: rate, monthly trend, and the session log.
class StudentAttendanceScreen extends ConsumerWidget {
  const StudentAttendanceScreen({super.key, required this.studentId});
  final String studentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(studentAttendanceProvider(studentId));
    final d = async.value;
    final monthly = (d?['monthly'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final records = (d?['records'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Attendance',
      subtitle: d?['studentName']?.toString() ?? '',
      icon: Icons.fact_check_rounded,
      onRefresh: () async => ref.invalidate(studentAttendanceProvider(studentId)),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (d == null)
          const AppCard(child: Text("Couldn't load attendance — pull down to retry.", style: TextStyle(color: AppColors.muted)))
        else ...[
          if (d['lowWarning'] == true)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: AppCard(child: Row(children: [
                const Icon(Icons.warning_amber_rounded, color: AppColors.danger),
                const SizedBox(width: 10),
                Expanded(child: Text('Attendance is below 75% (${d['rate']}%). This student may be at risk.',
                    style: const TextStyle(color: AppColors.danger, fontSize: 13, height: 1.3))),
              ])),
            ),
          Row(children: [
            Expanded(child: StatTile(icon: Icons.check_circle_rounded, value: d['rate'] == null ? '—' : '${d['rate']}%', label: 'Attendance', color: AppColors.teal)),
            const SizedBox(width: 12),
            Expanded(child: StatTile(icon: Icons.event_available_rounded, value: '${d['present']}/${d['total']}', label: 'Present', color: AppColors.good)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: StatTile(icon: Icons.cancel_rounded, value: '${d['absent']}', label: 'Absent', color: AppColors.danger)),
            const SizedBox(width: 12),
            Expanded(child: StatTile(icon: Icons.schedule_rounded, value: '${d['late']}', label: 'Late', color: AppColors.warn)),
          ]),
          if (monthly.isNotEmpty) ...[
            const SizedBox(height: 20),
            const SectionLabel('Monthly'),
            AppCard(child: Column(children: [
              for (final m in monthly)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Row(children: [
                    SizedBox(width: 72, child: Text(_month(m['month']?.toString() ?? ''),
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600))),
                    Expanded(child: ProgressBar(value: ((m['percent'] as num?)?.toDouble() ?? 0) / 100,
                        color: (m['percent'] as num? ?? 0) >= 75 ? AppColors.good : AppColors.warn)),
                    const SizedBox(width: 10),
                    Text('${m['present']}/${m['total']}', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                  ]),
                ),
            ])),
          ],
          const SizedBox(height: 20),
          const SectionLabel('Recent sessions'),
          if (records.isEmpty)
            const AppCard(child: Text('No attendance recorded yet.', style: TextStyle(color: AppColors.muted)))
          else
            AppCard(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), child: Column(children: [
              for (int i = 0; i < records.length; i++) ...[
                _row(records[i]),
                if (i < records.length - 1) const Hairline(),
              ],
            ])),
        ],
      ],
    );
  }

  String _month(String ym) {
    final parts = ym.split('-');
    if (parts.length != 2) return ym;
    const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final m = int.tryParse(parts[1]) ?? 0;
    return '${m > 0 && m < 13 ? names[m] : parts[1]} ${parts[0]}';
  }

  Widget _row(Map<String, dynamic> r) {
    final dt = DateTime.tryParse(r['date']?.toString() ?? '');
    final st = _status(r['status']?.toString() ?? '');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(dt != null ? _d.format(dt) : '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          if ((r['remarks']?.toString() ?? '').isNotEmpty)
            Text(r['remarks'].toString(), style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
        ])),
        StatusChip(label: st.label, color: st.c, bg: st.bg),
      ]),
    );
  }
}
