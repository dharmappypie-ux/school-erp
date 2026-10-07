import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

final _day = DateFormat('EEEE, d MMM');

class AttendanceScreen extends ConsumerWidget {
  const AttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final attendance = ref.watch(attendanceProvider);
    final list = attendance.value ?? const [];

    final present = list.where((d) => d.status == AttendanceStatus.present).length;
    final late = list.where((d) => d.status == AttendanceStatus.late).length;
    final absent = list.where((d) => d.status == AttendanceStatus.absent).length;
    final counted = present + late + absent;
    final pct = counted == 0 ? 0 : (((present + late) / counted) * 100).round();

    return DetailScaffold(
      title: 'Attendance',
      subtitle: 'Last $counted school days',
      icon: Icons.fact_check_rounded,
      onRefresh: () async {
        await ref.read(syncProvider).sync(manual: true);
        refreshData(ref);
      },
      hero: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('PRESENT THIS MONTH', style: eyebrow(Colors.white.withValues(alpha: 0.85))),
                const SizedBox(height: 6),
                Text('$pct%',
                    style: const TextStyle(
                        color: Colors.white, fontSize: 40, fontWeight: FontWeight.w800, height: 1)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _heroStat('$present', 'present'),
              const SizedBox(height: 6),
              _heroStat('$late', 'late'),
              const SizedBox(height: 6),
              _heroStat('$absent', 'absent'),
            ],
          ),
        ],
      ),
      children: [
        Row(
          children: [
            Expanded(child: StatTile(icon: Icons.event_available_rounded, value: '$present', label: 'Present', color: AppColors.good)),
            const SizedBox(width: 12),
            Expanded(child: StatTile(icon: Icons.schedule_rounded, value: '$late', label: 'Late', color: AppColors.warn)),
            const SizedBox(width: 12),
            Expanded(child: StatTile(icon: Icons.event_busy_rounded, value: '$absent', label: 'Absent', color: AppColors.danger)),
          ],
        ),
        const SizedBox(height: 22),
        const SectionLabel('Daily register'),
        attendance.when(
          loading: () => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
          error: (e, _) => AppCard(child: Text('$e')),
          data: (days) => AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
            child: Column(
              children: [
                for (var i = 0; i < days.length; i++) ...[
                  _DayRow(days[i]),
                  if (i < days.length - 1) const Hairline(),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _heroStat(String value, String label) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value,
              style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
          const SizedBox(width: 5),
          Text(label,
              style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12)),
        ],
      );
}

class _DayRow extends StatelessWidget {
  const _DayRow(this.d);
  final AttendanceDay d;

  @override
  Widget build(BuildContext context) {
    final (color, label, icon) = switch (d.status) {
      AttendanceStatus.present => (AppColors.good, 'Present', Icons.check_rounded),
      AttendanceStatus.late => (AppColors.warn, 'Late', Icons.schedule_rounded),
      AttendanceStatus.absent => (AppColors.danger, 'Absent', Icons.close_rounded),
      AttendanceStatus.holiday => (AppColors.faint, 'Holiday', Icons.beach_access_rounded),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
                color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(11)),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(_day.format(d.date),
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
          Text(label,
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }
}
