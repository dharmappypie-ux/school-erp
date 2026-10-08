import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';
import 'student_detail.dart';

({Color c, Color bg}) _levelTone(String l) => switch (l) {
      'CRITICAL' => (c: AppColors.danger, bg: AppColors.dangerSoft),
      'HIGH' => (c: AppColors.danger, bg: AppColors.dangerSoft),
      'MEDIUM' => (c: AppColors.warn, bg: AppColors.warnSoft),
      _ => (c: AppColors.good, bg: AppColors.goodSoft),
    };

/// AI insights: explainable dropout-risk scoring with a refresh action.
/// Mirror of the web /insights page.
class AdminInsightsScreen extends ConsumerStatefulWidget {
  const AdminInsightsScreen({super.key});
  @override
  ConsumerState<AdminInsightsScreen> createState() => _S();
}

class _S extends ConsumerState<AdminInsightsScreen> {
  String? _level;
  bool _refreshing = false;

  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/insights/refresh', {});
    if (!mounted) return;
    setState(() => _refreshing = false);
    showToast(context, res.body?['message']?.toString() ?? res.body?['error']?.toString() ?? 'Done.', error: !res.ok);
    if (res.ok) ref.invalidate(adminInsightsProvider(_level));
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(adminInsightsProvider(_level));
    final d = async.value;
    final items = (d?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final counts = (d?['countByLevel'] as Map?)?.cast<String, dynamic>() ?? const {};
    final canRefresh = d?['canRefresh'] == true;

    return DetailScaffold(
      title: 'AI insights',
      subtitle: 'Dropout-risk scoring',
      icon: Icons.auto_awesome_rounded,
      onRefresh: () async => ref.invalidate(adminInsightsProvider(_level)),
      children: [
        if (async.isLoading && d == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (d == null)
          const AppCard(child: Text("Couldn't load insights — pull down to retry.", style: TextStyle(color: AppColors.muted)))
        else ...[
          if (canRefresh)
            AppCard(child: Row(children: [
              const Expanded(child: Text('Recompute risk across attendance, marks, fees & homework.',
                  style: TextStyle(fontSize: 13, color: AppColors.muted))),
              TextButton(onPressed: _refreshing ? null : _refresh, child: Text(_refreshing ? 'Scoring…' : 'Refresh')),
            ])),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: StatTile(icon: Icons.error_rounded, value: '${(counts['CRITICAL'] ?? 0) as num}', label: 'Critical', color: AppColors.danger)),
            const SizedBox(width: 12),
            Expanded(child: StatTile(icon: Icons.warning_amber_rounded, value: '${(counts['HIGH'] ?? 0) as num}', label: 'High', color: AppColors.danger)),
            const SizedBox(width: 12),
            Expanded(child: StatTile(icon: Icons.info_rounded, value: '${(counts['MEDIUM'] ?? 0) as num}', label: 'Medium', color: AppColors.warn)),
          ]),
          const SizedBox(height: 16),
          // Level filter
          SizedBox(height: 34, child: ListView(scrollDirection: Axis.horizontal, children: [
            for (final l in const [null, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
              Padding(padding: const EdgeInsets.only(right: 8), child: GestureDetector(
                onTap: () => setState(() => _level = l),
                child: Container(
                  alignment: Alignment.center, padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(color: _level == l ? AppColors.primary : AppColors.surface, borderRadius: BorderRadius.circular(AppRadius.pill)),
                  child: Text(l == null ? 'At risk' : l[0] + l.substring(1).toLowerCase(),
                      style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: _level == l ? Colors.white : AppColors.muted)),
                ),
              )),
          ])),
          const SizedBox(height: 14),
          if (items.isEmpty)
            const AppCard(child: Text('No students at this level. Refresh to recompute.', style: TextStyle(color: AppColors.muted)))
          else
            for (final s in items)
              Padding(padding: const EdgeInsets.only(bottom: 10), child: AppCard(
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => StudentDetailScreen(studentId: s['studentId'].toString()))),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(s['name']?.toString() ?? '', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                      Text('${s['className'] ?? ''} · ${s['admissionNo'] ?? ''}', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                    ])),
                    StatusChip(label: '${s['score']}', color: _levelTone(s['level']?.toString() ?? '').c, bg: _levelTone(s['level']?.toString() ?? '').bg),
                    const SizedBox(width: 6),
                    StatusChip(label: (s['level']?.toString() ?? '').toLowerCase(), color: _levelTone(s['level']?.toString() ?? '').c, bg: _levelTone(s['level']?.toString() ?? '').bg),
                  ]),
                  if ((s['factors'] as List?)?.isNotEmpty == true) ...[
                    const SizedBox(height: 8),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      for (final f in (s['factors'] as List).cast<Map<String, dynamic>>())
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(AppRadius.pill)),
                          child: Text('${(f['signal'] ?? '').toString().replaceAll('_', ' ')}: ${f['value']}',
                              style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                        ),
                    ]),
                  ],
                ]),
              )),
        ],
      ],
    );
  }
}
