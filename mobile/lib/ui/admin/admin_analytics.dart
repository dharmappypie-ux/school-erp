import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

final _inr = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// School analytics dashboard — stat tiles + lightweight charts for attendance,
/// academics, finance and admissions. Mirror of the web /analytics page.
class AdminAnalyticsScreen extends ConsumerWidget {
  const AdminAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminAnalyticsProvider);
    final d = async.value;
    final enr = (d?['enrolment'] as Map?)?.cast<String, dynamic>() ?? const {};
    final att = (d?['attendance'] as Map?)?.cast<String, dynamic>() ?? const {};
    final acad = (d?['academics'] as Map?)?.cast<String, dynamic>() ?? const {};
    final fin = (d?['finance'] as Map?)?.cast<String, dynamic>() ?? const {};
    final adm = (d?['admissions'] as Map?)?.cast<String, dynamic>() ?? const {};
    final svc = (d?['services'] as Map?)?.cast<String, dynamic>() ?? const {};

    return DetailScaffold(
      title: 'Analytics',
      subtitle: 'School at a glance',
      icon: Icons.bar_chart_rounded,
      onRefresh: () async => ref.invalidate(adminAnalyticsProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (d == null)
          const AppCard(child: Text("Couldn't load analytics — pull down to retry.", style: TextStyle(color: AppColors.muted)))
        else ...[
          Row(children: [
            Expanded(child: StatTile(icon: Icons.school_rounded, value: '${enr['activeStudents'] ?? 0}', label: 'Students', color: AppColors.primary)),
            const SizedBox(width: 12),
            Expanded(child: StatTile(icon: Icons.badge_rounded, value: '${enr['staffCount'] ?? 0}', label: 'Staff', color: AppColors.teal)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: StatTile(icon: Icons.fact_check_rounded, value: '${att['rate'] ?? 0}%', label: 'Attendance 30d', color: AppColors.good,
                onTap: null)),
            const SizedBox(width: 12),
            Expanded(child: StatTile(icon: Icons.payments_rounded, value: '${fin['collectionRate'] ?? 0}%', label: 'Fees collected', color: AppColors.gold)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: StatTile(icon: Icons.grade_rounded, value: acad['mean'] == null ? '—' : '${acad['mean']}%', label: 'Avg score', color: AppColors.primary)),
            const SizedBox(width: 12),
            Expanded(child: StatTile(icon: Icons.how_to_reg_rounded, value: '${adm['applications'] ?? 0}', label: 'Applications', color: AppColors.teal)),
          ]),

          // Attendance 14-day trend
          if ((att['daily'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 20),
            _ChartCard(
              title: 'Attendance — last 14 days',
              trailing: _TrendChip(att['trend']),
              child: _VerticalBars(
                points: (att['daily'] as List).cast<Map<String, dynamic>>(),
                color: AppColors.good,
              ),
            ),
          ],

          // Grade spread
          if ((acad['gradeSpread'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            _ChartCard(
              title: 'Score distribution',
              subtitle: 'Pass rate ${acad['passRate'] ?? '—'}% · ${acad['assessments'] ?? 0} assessments',
              child: _HBars(
                rows: [for (final b in (acad['gradeSpread'] as List).cast<Map<String, dynamic>>())
                  (label: b['label'].toString(), value: (b['count'] as num).toDouble(), note: '${b['percent']}%')],
                color: AppColors.primary,
              ),
            ),
          ],

          // Subject rankings
          if ((acad['topSubjects'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            _ChartCard(
              title: 'Strongest subjects',
              child: _HBars(
                rows: [for (final s in (acad['topSubjects'] as List).cast<Map<String, dynamic>>())
                  (label: s['label'].toString(), value: (s['value'] as num).toDouble(), note: '${s['value']}%')],
                color: AppColors.good, max: 100,
              ),
            ),
          ],
          if ((acad['bottomSubjects'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            _ChartCard(
              title: 'Needs attention',
              child: _HBars(
                rows: [for (final s in (acad['bottomSubjects'] as List).cast<Map<String, dynamic>>())
                  (label: s['label'].toString(), value: (s['value'] as num).toDouble(), note: '${s['value']}%')],
                color: AppColors.danger, max: 100,
              ),
            ),
          ],

          // Finance: aging
          if ((fin['aging'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            _ChartCard(
              title: 'Overdue fees — aging',
              subtitle: 'Total overdue ${_inr.format((fin['totalOverdue'] ?? 0) as num)}',
              child: _HBars(
                rows: [for (final a in (fin['aging'] as List).cast<Map<String, dynamic>>())
                  (label: a['label'].toString(), value: (a['amount'] as num).toDouble(), note: _inr.format((a['amount'] ?? 0) as num))],
                color: AppColors.danger,
              ),
            ),
          ],

          // Admissions funnel
          if ((adm['funnel'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            _ChartCard(
              title: 'Admissions funnel',
              child: _HBars(
                rows: [for (final f in (adm['funnel'] as List).cast<Map<String, dynamic>>())
                  (label: f['label'].toString().replaceAll('_', ' ').toLowerCase(), value: (f['value'] as num).toDouble(), note: '${f['value']}')],
                color: AppColors.teal,
              ),
            ),
          ],

          const SizedBox(height: 16),
          _ChartCard(
            title: 'Services',
            child: Column(children: [
              _svcRow('Transport users', svc['transportAssigned']),
              const Hairline(),
              _svcRow('Hostel residents', svc['hostelAllocated']),
              const Hairline(),
              _svcRow('Books on loan', svc['booksOnLoan']),
              const Hairline(),
              _svcRow('Capacity utilisation', '${enr['utilisation'] ?? 0}%'),
            ]),
          ),
        ],
      ],
    );
  }

  Widget _svcRow(String k, dynamic v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(children: [
          Expanded(child: Text(k, style: const TextStyle(fontSize: 13, color: AppColors.muted))),
          Text('$v', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
        ]),
      );
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.title, required this.child, this.subtitle, this.trailing});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  @override
  Widget build(BuildContext context) => AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700))),
            if (trailing != null) trailing!,
          ]),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ],
          const SizedBox(height: 14),
          child,
        ]),
      );
}

/// Horizontal labelled bars.
class _HBars extends StatelessWidget {
  const _HBars({required this.rows, required this.color, this.max});
  final List<({String label, double value, String note})> rows;
  final Color color;
  final double? max;
  @override
  Widget build(BuildContext context) {
    final peak = max ?? (rows.isEmpty ? 1.0 : rows.map((r) => r.value).reduce((a, b) => a > b ? a : b));
    final safePeak = peak <= 0 ? 1.0 : peak;
    return Column(children: [
      for (final r in rows)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(children: [
            SizedBox(width: 92, child: Text(r.label, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: AppColors.muted))),
            Expanded(child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Stack(children: [
                Container(height: 16, color: AppColors.line),
                FractionallySizedBox(
                  widthFactor: (r.value / safePeak).clamp(0.02, 1.0),
                  child: Container(height: 16, color: color.withValues(alpha: 0.85)),
                ),
              ]),
            )),
            const SizedBox(width: 10),
            SizedBox(width: 64, child: Text(r.note, textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))),
          ]),
        ),
    ]);
  }
}

/// Vertical bars for a daily series (attendance %).
class _VerticalBars extends StatelessWidget {
  const _VerticalBars({required this.points, required this.color});
  final List<Map<String, dynamic>> points;
  final Color color;
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 90,
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (final p in points)
          Expanded(child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 1.5),
            child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
              Text('${p['value']}', style: const TextStyle(fontSize: 8, color: AppColors.faint)),
              const SizedBox(height: 2),
              Container(
                height: (((p['value'] as num?)?.toDouble() ?? 0) / 100 * 64).clamp(2, 64),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.85), borderRadius: BorderRadius.circular(3)),
              ),
            ]),
          )),
      ]),
    );
  }
}

class _TrendChip extends StatelessWidget {
  const _TrendChip(this.trend);
  final dynamic trend;
  @override
  Widget build(BuildContext context) {
    final t = (trend as Map?)?.cast<String, dynamic>();
    final dir = t?['direction']?.toString();
    final pct = t?['percentChange'];
    if (dir == null || dir == 'FLAT' || pct == null) {
      return const StatusChip(label: 'no change', color: AppColors.muted, bg: AppColors.line);
    }
    if (dir == 'NEW') return const StatusChip(label: 'new', color: AppColors.primary, bg: AppColors.accentSoft);
    final up = dir == 'UP';
    return StatusChip(
      label: '${up ? '▲' : '▼'} ${pct.abs()}%',
      color: up ? AppColors.good : AppColors.danger,
      bg: up ? AppColors.goodSoft : AppColors.dangerSoft,
    );
  }
}
