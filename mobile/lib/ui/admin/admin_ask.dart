import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

const _suggestions = [
  'How many active students are there?',
  'List students with status alumni',
  'Show staff in the teaching department',
  'List invoices that are overdue',
  'Students admitted this year',
];

/// Ask AI — a natural-language query over the school's data. Mirror of the web
/// /ask page. Uses the shared NL-query engine (AI, or a keyword fallback).
class AdminAskScreen extends ConsumerStatefulWidget {
  const AdminAskScreen({super.key});
  @override
  ConsumerState<AdminAskScreen> createState() => _S();
}

class _S extends ConsumerState<AdminAskScreen> {
  final _q = TextEditingController();
  bool _asking = false;
  Map<String, dynamic>? _result;

  Future<void> _ask([String? preset]) async {
    final question = (preset ?? _q.text).trim();
    if (question.length < 4) {
      showToast(context, 'Ask a longer question.', error: true);
      return;
    }
    if (preset != null) _q.text = preset;
    FocusScope.of(context).unfocus();
    setState(() { _asking = true; _result = null; });
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/ask', {'question': question});
    if (!mounted) return;
    setState(() { _asking = false; _result = res.body; });
  }

  @override
  Widget build(BuildContext context) {
    final r = _result;
    final cols = (r?['columns'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final rows = (r?['rows'] as List?)?.map((e) => (e as List).cast<dynamic>()).toList() ?? const [];
    final reading = (r?['reading'] as Map?)?.cast<String, dynamic>();

    return DetailScaffold(
      title: 'Ask AI',
      subtitle: 'Ask about your school data',
      icon: Icons.auto_awesome_rounded,
      children: [
        AppTextField(controller: _q, label: 'Your question', hint: 'e.g. How many students are in Class 1?', maxLines: 2),
        const SizedBox(height: 14),
        PrimaryButton(
          label: _asking ? 'Thinking…' : 'Ask',
          icon: Icons.send_rounded,
          onPressed: _asking ? null : () => _ask(),
        ),
        const SizedBox(height: 16),
        const SectionLabel('Try'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final s in _suggestions)
            GestureDetector(
              onTap: _asking ? null : () => _ask(s),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(color: AppColors.accentSoft, borderRadius: BorderRadius.circular(AppRadius.pill)),
                child: Text(s, style: const TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w600)),
              ),
            ),
        ]),

        if (_asking) ...[
          const SizedBox(height: 24),
          const SizedBox(height: 60, child: Center(child: CircularProgressIndicator())),
        ] else if (r != null) ...[
          const SizedBox(height: 22),
          AppCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(r['ok'] == true ? Icons.auto_awesome_rounded : Icons.info_outline_rounded,
                    color: r['ok'] == true ? AppColors.primary : AppColors.warn, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(r['ok'] == true ? 'Answer' : 'Not answerable',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700))),
                StatusChip(
                  label: r['usedAi'] == true ? 'AI' : 'keyword',
                  color: AppColors.muted, bg: AppColors.line,
                ),
              ]),
              const SizedBox(height: 8),
              Text(r['explanation']?.toString() ?? '', style: const TextStyle(height: 1.4)),
              if (reading != null) ...[
                const SizedBox(height: 10),
                const Hairline(),
                const SizedBox(height: 8),
                Text('Reading ${reading['source']} · ${(reading['columns'] as List?)?.join(', ') ?? ''}'
                    '${(reading['filters'] as List?)?.isNotEmpty == true ? '\nwhere ${(reading['filters'] as List).join(', ')}' : ''}'
                    '${reading['sort'] != null ? '\nsorted by ${reading['sort']}' : ''}',
                    style: const TextStyle(fontSize: 11.5, color: AppColors.muted, height: 1.4)),
              ],
            ]),
          ),
          if (r['rowCount'] != null) ...[
            const SizedBox(height: 10),
            Text('${r['rowCount']} row(s)${r['truncated'] == true ? ' (truncated)' : ''}',
                style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          ],
          if (cols.isNotEmpty && rows.isNotEmpty) ...[
            const SizedBox(height: 8),
            AppCard(
              padding: const EdgeInsets.all(0),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  headingRowHeight: 40, dataRowMinHeight: 36, dataRowMaxHeight: 44, columnSpacing: 22,
                  columns: [for (final c in cols) DataColumn(label: Text(c['label']?.toString() ?? '',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)))],
                  rows: [for (final row in rows.take(100)) DataRow(cells: [
                    for (final cell in row) DataCell(Text(cell?.toString() ?? '—', style: const TextStyle(fontSize: 12.5))),
                  ])],
                ),
              ),
            ),
          ],
        ],
      ],
    );
  }

  @override
  void dispose() { _q.dispose(); super.dispose(); }
}
