import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Reports: pick a data source, choose columns, run — and view the rows.
/// Mirror of the web reports builder (run side; saving/CSV export are web-only).
class AdminReportsScreen extends ConsumerStatefulWidget {
  const AdminReportsScreen({super.key});
  @override
  ConsumerState<AdminReportsScreen> createState() => _S();
}

class _S extends ConsumerState<AdminReportsScreen> {
  Map<String, dynamic>? _source;
  final Set<String> _columns = {};
  bool _running = false;
  List<Map<String, dynamic>> _cols = const [];
  List<List<dynamic>> _rows = const [];
  String? _result;

  Future<void> _run() async {
    if (_source == null || _columns.isEmpty) {
      showToast(context, 'Choose a source and at least one column.', error: true);
      return;
    }
    setState(() { _running = true; _result = null; });
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/reports/run', {
      'source': _source!['key'],
      'columns': _columns.toList(),
      'limit': 200,
    });
    if (!mounted) return;
    setState(() {
      _running = false;
      if (res.ok) {
        _cols = (res.body?['columns'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        _rows = (res.body?['rows'] as List?)?.map((r) => (r as List).cast<dynamic>()).toList() ?? const [];
        _result = res.body?['message']?.toString();
      } else {
        _result = res.body?['error']?.toString() ?? 'Could not run the report.';
        _cols = const []; _rows = const [];
      }
    });
    if (!res.ok) showToast(context, _result ?? 'Error', error: true);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(adminReportsProvider);
    final sources = (async.value?['sources'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final fields = (_source?['fields'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Reports',
      subtitle: 'Build & run a report',
      icon: Icons.summarize_rounded,
      onRefresh: () async => ref.invalidate(adminReportsProvider),
      children: [
        if (async.isLoading && async.value == null)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted)))
        else ...[
          AppDropdown<Map<String, dynamic>>(
            label: 'Data source', required: true, value: _source, items: sources,
            itemLabel: (s) => s['label']?.toString() ?? '',
            onChanged: (s) => setState(() { _source = s; _columns.clear(); _cols = const []; _rows = const []; _result = null; }),
          ),
          if (_source != null) ...[
            const SizedBox(height: 6),
            Text(_source!['description']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: AppColors.faint)),
            const SizedBox(height: 16),
            const SectionLabel('Columns'),
            AppCard(child: Wrap(spacing: 8, runSpacing: 8, children: [
              for (final f in fields)
                GestureDetector(
                  onTap: () => setState(() {
                    final k = f['key'].toString();
                    _columns.contains(k) ? _columns.remove(k) : _columns.add(k);
                  }),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: _columns.contains(f['key']) ? AppColors.primary : AppColors.line,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                    child: Text(f['label']?.toString() ?? '',
                        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600,
                            color: _columns.contains(f['key']) ? Colors.white : AppColors.muted)),
                  ),
                ),
            ])),
            const SizedBox(height: 16),
            PrimaryButton(
              label: _running ? 'Running…' : 'Run report (${_columns.length} cols)',
              icon: Icons.play_arrow_rounded,
              onPressed: _running ? null : _run,
            ),
          ],
          if (_result != null) ...[
            const SizedBox(height: 18),
            Text(_result!, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          ],
          if (_cols.isNotEmpty) ...[
            const SizedBox(height: 10),
            AppCard(
              padding: const EdgeInsets.all(0),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  headingRowHeight: 40,
                  dataRowMinHeight: 36,
                  dataRowMaxHeight: 44,
                  columnSpacing: 22,
                  columns: [for (final c in _cols) DataColumn(label: Text(c['label']?.toString() ?? '',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)))],
                  rows: [
                    for (final r in _rows.take(200))
                      DataRow(cells: [for (final cell in r) DataCell(Text(cell?.toString() ?? '—',
                          style: const TextStyle(fontSize: 12.5)))]),
                  ],
                ),
              ),
            ),
          ],
        ],
      ],
    );
  }
}
