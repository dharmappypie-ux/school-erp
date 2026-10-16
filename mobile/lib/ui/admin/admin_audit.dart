import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

/// The audit trail: who changed what, when. Paged — a busy school writes
/// thousands of rows a term, and a phone should not pull them all.
class AdminAuditScreen extends ConsumerStatefulWidget {
  const AdminAuditScreen({super.key});
  @override
  ConsumerState<AdminAuditScreen> createState() => _AdminAuditScreenState();
}

class _AdminAuditScreenState extends ConsumerState<AdminAuditScreen> {
  int _page = 1;
  String? _entityType;

  @override
  Widget build(BuildContext context) {
    final key = (page: _page, entityType: _entityType);
    final async = ref.watch(adminAuditProvider(key));
    final data = async.value;
    final entries = (data?['entries'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final types = (data?['entityTypes'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Audit log',
      subtitle: data == null ? 'Loading…' : '${data['total']} entries',
      icon: Icons.history_rounded,
      onRefresh: () async => ref.invalidate(adminAuditProvider(key)),
      children: [
        if (data != null) ...[
          Row(children: [
            Expanded(
              child: StatTile(
                icon: Icons.bolt_rounded,
                value: '${data['today'] ?? 0}',
                label: 'Changes in 24 hours',
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: StatTile(
                icon: Icons.inventory_2_rounded,
                value: '${types.length}',
                label: 'Record types touched',
                color: AppColors.teal,
              ),
            ),
          ]),
          const SizedBox(height: 18),
          const SectionLabel('Filter'),
          SizedBox(
            height: 38,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _Chip(
                  label: 'Everything',
                  selected: _entityType == null,
                  onTap: () => setState(() {
                    _entityType = null;
                    _page = 1;
                  }),
                ),
                for (final t in types)
                  _Chip(
                    label: '${t['entityType']} · ${t['count']}',
                    selected: _entityType == t['entityType'],
                    onTap: () => setState(() {
                      _entityType = t['entityType']?.toString();
                      _page = 1;
                    }),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 18),
        ],
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (data == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't load the audit log — pull down to retry.",
                    style: TextStyle(color: AppColors.muted)),
              ),
            ]),
          )
        else if (entries.isEmpty)
          const AppCard(child: Text('Nothing recorded yet.', style: TextStyle(color: AppColors.muted)))
        else ...[
          AppCard(
            child: Column(children: [
              for (var i = 0; i < entries.length; i++) ...[
                if (i > 0) const Hairline(),
                _Entry(entries[i]),
              ],
            ]),
          ),
          const SizedBox(height: 16),
          Row(children: [
            if (_page > 1)
              Expanded(
                child: _Pager(
                  label: 'Newer',
                  icon: Icons.chevron_left_rounded,
                  onTap: () => setState(() => _page -= 1),
                ),
              ),
            if (_page > 1 && data['hasMore'] == true) const SizedBox(width: 12),
            if (data['hasMore'] == true)
              Expanded(
                child: _Pager(
                  label: 'Older',
                  icon: Icons.chevron_right_rounded,
                  onTap: () => setState(() => _page += 1),
                ),
              ),
          ]),
        ],
      ],
    );
  }
}

class _Entry extends StatelessWidget {
  const _Entry(this.e);
  final Map<String, dynamic> e;

  @override
  Widget build(BuildContext context) {
    final at = (e['at'] as String?) ?? '';
    final date = at.split('T').first;
    final time = at.contains('T') ? at.split('T')[1].substring(0, 5) : '';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e['action']?.toString() ?? '',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  '${e['by']} · ${e['entityType']}'
                  '${e['ipAddress'] != null ? " · ${e['ipAddress']}" : ""}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(date, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
              Text(time, style: const TextStyle(fontSize: 11, color: AppColors.faint)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: selected ? AppColors.primary : AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.pill),
              boxShadow: selected ? null : kCardShadow,
            ),
            child: Text(label,
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white : AppColors.muted)),
          ),
        ),
      );
}

class _Pager extends StatelessWidget {
  const _Pager({required this.label, required this.icon, required this.onTap});
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 13),
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: AppColors.accentSoft, borderRadius: BorderRadius.circular(AppRadius.chip)),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, size: 18, color: AppColors.primary),
            const SizedBox(width: 4),
            Text(label,
                style: const TextStyle(
                    fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 13.5)),
          ]),
        ),
      );
}
