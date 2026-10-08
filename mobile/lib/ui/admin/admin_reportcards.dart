import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Report cards: see each card's result and publish/unpublish it to parents.
class AdminReportCardsScreen extends ConsumerWidget {
  const AdminReportCardsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminReportCardsProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final canPublish = async.value?['canPublish'] == true;
    final canGenerate = async.value?['canGenerate'] == true;
    final terms = (async.value?['terms'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final sections = (async.value?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final unpublished = items.where((c) => c['published'] != true).length;

    return DetailScaffold(
      title: 'Report cards',
      subtitle: '$unpublished unpublished · ${items.length} total',
      icon: Icons.description_rounded,
      onRefresh: () async => ref.invalidate(adminReportCardsProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else ...[
          if (canGenerate && terms.isNotEmpty && sections.isNotEmpty) ...[
            _GeneratePanel(terms: terms, sections: sections),
            const SizedBox(height: 16),
            const SectionLabel('Generated cards'),
          ],
          if (items.isEmpty)
            const AppCard(child: Text('No report cards generated yet. Use Generate above to build them from recorded marks.', style: TextStyle(color: AppColors.muted)))
          else
            for (final c in items) ...[
              _CardRow(c: c, canPublish: canPublish),
              const SizedBox(height: 10),
            ],
        ],
      ],
    );
  }
}

/// Generate (recompute) report cards for a term × section from recorded marks.
class _GeneratePanel extends ConsumerStatefulWidget {
  const _GeneratePanel({required this.terms, required this.sections});
  final List<Map<String, dynamic>> terms;
  final List<Map<String, dynamic>> sections;
  @override
  ConsumerState<_GeneratePanel> createState() => _GeneratePanelState();
}

class _GeneratePanelState extends ConsumerState<_GeneratePanel> {
  Map<String, dynamic>? _term;
  Map<String, dynamic>? _section;
  bool _busy = false;

  Future<void> _generate() async {
    if (_term == null || _section == null) {
      showToast(context, 'Choose a term and a class.', error: true);
      return;
    }
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/reportcards/generate', {
      'termId': _term!['id'], 'sectionId': _section!['id'],
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Generated.' : 'Could not generate.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminReportCardsProvider);
  }

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Generate report cards',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          const Text('Builds cards from recorded marks for a term and class.',
              style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
          const SizedBox(height: 14),
          AppDropdown<Map<String, dynamic>>(
            label: 'Term',
            required: true,
            value: _term,
            items: widget.terms,
            itemLabel: (t) => t['name']?.toString() ?? '',
            onChanged: (t) => setState(() => _term = t),
          ),
          const SizedBox(height: 12),
          AppDropdown<Map<String, dynamic>>(
            label: 'Class',
            required: true,
            value: _section,
            items: widget.sections,
            itemLabel: (s) => s['name']?.toString() ?? '',
            onChanged: (s) => setState(() => _section = s),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: _busy ? 'Generating…' : 'Generate',
            icon: Icons.auto_awesome_rounded,
            onPressed: _busy ? null : _generate,
          ),
        ],
      ),
    );
  }
}

class _CardRow extends ConsumerStatefulWidget {
  const _CardRow({required this.c, required this.canPublish});
  final Map<String, dynamic> c;
  final bool canPublish;
  @override
  ConsumerState<_CardRow> createState() => _CardRowState();
}

class _CardRowState extends ConsumerState<_CardRow> {
  bool _busy = false;

  Future<void> _toggle(bool publish) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/reportcards/publish', {
      'cardId': widget.c['id'], 'publish': publish,
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Done.' : 'Could not update.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminReportCardsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final published = c['published'] == true;
    return AppCard(
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(c['student']?.toString() ?? '', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text('${c['term'] ?? ''} · ${c['percentage'] ?? '—'}% · ${c['grade'] ?? ''}${c['rank'] != null ? ' · rank ${c['rank']}' : ''}',
              style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
        ])),
        if (widget.canPublish)
          GestureDetector(
            onTap: _busy ? null : () => _toggle(!published),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: published ? AppColors.line : AppColors.goodSoft,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text(published ? 'Unpublish' : 'Publish',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: published ? AppColors.muted : AppColors.good)),
            ),
          )
        else
          StatusChip(
            label: published ? 'Published' : 'Draft',
            color: published ? AppColors.good : AppColors.muted,
            bg: published ? AppColors.goodSoft : AppColors.line,
          ),
      ]),
    );
  }
}
