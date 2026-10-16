import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// End-of-year promotion: move a whole class into next year's section, with a
/// per-student outcome for the ones who are not simply going up.
///
/// The run is one transaction on the server — every student moves or none
/// does — because a half-promoted class leaves children with no active
/// enrollment, invisible to attendance and fees.
class AdminPromoteScreen extends ConsumerStatefulWidget {
  const AdminPromoteScreen({super.key});
  @override
  ConsumerState<AdminPromoteScreen> createState() => _AdminPromoteScreenState();
}

class _AdminPromoteScreenState extends ConsumerState<AdminPromoteScreen> {
  String? _source;
  String? _target;
  bool _allowOverfill = false;
  bool _running = false;
  final Map<String, String> _outcomes = {};
  List<String> _skipped = const [];

  static const _outcomeLabels = {
    'PROMOTED': 'Moves up',
    'RETAINED': 'Repeats the year',
    'PASSED_OUT': 'Leaves — finished school',
    'TRANSFERRED': 'Leaves — transferred',
  };

  Future<void> _run() async {
    if (_source == null || _target == null) {
      showToast(context, 'Choose the class to promote from and into.', error: true);
      return;
    }
    final sure = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Promote this class?'),
        content: const Text(
            'Every student on the roll is moved in one go. This closes their current '
            'enrollment and opens next year’s — it is not undone by tapping back.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Promote')),
        ],
      ),
    );
    if (sure != true) return;

    setState(() {
      _running = true;
      _skipped = const [];
    });
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/promote', {
      'sourceSectionId': _source,
      'targetSectionId': _target,
      'allowOverfill': _allowOverfill,
      'outcomes': _outcomes,
    });
    if (!mounted) return;
    setState(() {
      _running = false;
      _skipped = ((res.body?['skipped'] as List?) ?? const []).map((e) => e.toString()).toList();
    });
    final msg = (res.body?['message'] ?? res.body?['error'] ?? 'Could not promote.').toString();
    showToast(context, msg, error: !res.ok);
    if (res.ok) {
      setState(() => _outcomes.clear());
      ref.invalidate(adminPromoteProvider(_source));
      ref.invalidate(adminStudentsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(adminPromoteProvider(_source));
    final data = async.value;
    final sections = (data?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final roster = (data?['roster'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    String labelFor(String? id) {
      if (id == null) return '';
      final s = sections.firstWhere((e) => e['id'] == id, orElse: () => const {});
      return s.isEmpty ? '' : '${s['label']} · ${s['yearName']}';
    }

    return DetailScaffold(
      title: 'Promotion',
      subtitle: 'Move a class into the next year',
      icon: Icons.moving_rounded,
      onRefresh: () async => ref.invalidate(adminPromoteProvider(_source)),
      children: [
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (data == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't load the classes — pull down to retry.",
                    style: TextStyle(color: AppColors.muted)),
              ),
            ]),
          )
        else ...[
          const SectionLabel('From'),
          AppDropdown<String>(
            label: 'Class to promote from',
            value: _source,
            items: sections.map((s) => s['id'].toString()).toList(),
            itemLabel: (id) {
              final s = sections.firstWhere((e) => e['id'] == id);
              return '${s['label']} · ${s['yearName']} · ${s['filled']}/${s['capacity']}';
            },
            onChanged: (v) => setState(() {
              _source = v;
              _outcomes.clear();
              _skipped = const [];
            }),
          ),
          const SizedBox(height: 16),
          const SectionLabel('Into'),
          AppDropdown<String>(
            label: 'Class to promote into',
            value: _target,
            // A promotion crosses academic years: the same year's sections are a
            // lateral move and the server refuses them, so they are not offered.
            items: sections
                .where((s) =>
                    _source == null ||
                    s['yearId'] !=
                        sections.firstWhere((e) => e['id'] == _source,
                            orElse: () => const {})['yearId'])
                .map((s) => s['id'].toString())
                .toList(),
            itemLabel: (id) {
              final s = sections.firstWhere((e) => e['id'] == id);
              return '${s['label']} · ${s['yearName']} · ${s['filled']}/${s['capacity']}'
                  '${s['yearIsLocked'] == true ? " · locked" : ""}';
            },
            onChanged: (v) => setState(() => _target = v),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: ToggleRow(
              title: 'Allow over capacity',
              subtitle: 'Let the target class go past its seat count',
              value: _allowOverfill,
              onChanged: (v) => setState(() => _allowOverfill = v),
            ),
          ),
          if (_source != null) ...[
            const SizedBox(height: 20),
            SectionLabel('Roll · ${roster.length}'),
            if (roster.isEmpty)
              const AppCard(
                child: Text('That class has no active students.',
                    style: TextStyle(color: AppColors.muted)),
              )
            else
              AppCard(
                child: Column(children: [
                  for (var i = 0; i < roster.length; i++) ...[
                    if (i > 0) const Hairline(),
                    _StudentRow(
                      student: roster[i],
                      outcome: _outcomes[roster[i]['studentId']] ?? 'PROMOTED',
                      labels: _outcomeLabels,
                      onChanged: (v) => setState(() {
                        if (v == 'PROMOTED') {
                          _outcomes.remove(roster[i]['studentId']);
                        } else {
                          _outcomes[roster[i]['studentId'].toString()] = v;
                        }
                      }),
                    ),
                  ],
                ]),
              ),
          ],
          if (_skipped.isNotEmpty) ...[
            const SizedBox(height: 16),
            const SectionLabel('Left alone'),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final line in _skipped)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Text(line,
                          style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 22),
          PrimaryButton(
            label: _running
                ? 'Promoting…'
                : _source == null || _target == null
                    ? 'Choose both classes'
                    : 'Promote ${labelFor(_source)}',
            icon: Icons.moving_rounded,
            onPressed: _running || _source == null || _target == null ? null : _run,
          ),
        ],
      ],
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    required this.student,
    required this.outcome,
    required this.labels,
    required this.onChanged,
  });
  final Map<String, dynamic> student;
  final String outcome;
  final Map<String, String> labels;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(student['name']?.toString() ?? '',
                    style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  '${student['admissionNo']}'
                  '${student['rollNumber'] != null ? " · Roll ${student['rollNumber']}" : ""}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            initialValue: outcome,
            onSelected: onChanged,
            itemBuilder: (_) => [
              for (final entry in labels.entries)
                PopupMenuItem(value: entry.key, child: Text(entry.value)),
            ],
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: outcome == 'PROMOTED' ? AppColors.goodSoft : AppColors.warnSoft,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(labels[outcome] ?? outcome,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: outcome == 'PROMOTED' ? AppColors.good : AppColors.warn)),
                const SizedBox(width: 2),
                Icon(Icons.expand_more_rounded,
                    size: 15,
                    color: outcome == 'PROMOTED' ? AppColors.good : AppColors.warn),
              ]),
            ),
          ),
        ]),
      );
}
