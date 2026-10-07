import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

/// A generic, data-backed list screen for any module. It fetches
/// `/api/mobile/v1/<role>/module/<name>` and renders the normalised items
/// (title / subtitle / trailing / coloured badge). One screen powers every
/// module that doesn't need a bespoke UI.
class ModuleListScreen extends ConsumerWidget {
  const ModuleListScreen({
    super.key,
    required this.role,
    required this.name,
    required this.title,
    required this.icon,
    this.onAdd,
    this.addLabel,
  });
  final String role;
  final String name;
  final String title;
  final IconData icon;

  /// When set, a "+" FAB is shown that opens a create flow for this module.
  final void Function(BuildContext, WidgetRef)? onAdd;
  final String? addLabel;

  Color _badgeColor(String? b) => switch (b) {
        'good' => AppColors.good,
        'warn' => AppColors.warn,
        'danger' => AppColors.danger,
        _ => AppColors.muted,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(moduleProvider((role: role, name: name)));
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final note = async.value?['note'] as String?;
    // getJson returns null when the server couldn't be reached; a reached-but-
    // empty module returns a map with an empty items list. Distinguish them so
    // "offline" doesn't masquerade as "no records".
    final offline = !async.isLoading && async.value == null;

    return DetailScaffold(
      title: async.value?['title']?.toString() ?? title,
      subtitle: offline
          ? 'Not loaded'
          : items.isEmpty
              ? 'No records'
              : '${items.length} ${items.length == 1 ? 'record' : 'records'}',
      icon: icon,
      onRefresh: () async => ref.invalidate(moduleProvider((role: role, name: name))),
      fab: onAdd == null
          ? null
          : FloatingActionButton.extended(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              onPressed: () => onAdd!(context, ref),
              icon: const Icon(Icons.add_rounded),
              label: Text(addLabel ?? 'Add'),
            ),
      children: [
        if (async.isLoading)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          AppCard(
            child: Row(
              children: [
                const Icon(Icons.cloud_off_rounded, color: AppColors.warn),
                const SizedBox(width: 12),
                const Expanded(
                    child: Text("Couldn't reach the school — this loads when you're online. Pull down to retry.",
                        style: TextStyle(color: AppColors.muted))),
              ],
            ),
          )
        else if (items.isEmpty)
          AppCard(
            child: Row(
              children: [
                const Icon(Icons.inbox_rounded, color: AppColors.faint),
                const SizedBox(width: 12),
                Expanded(child: Text(note ?? 'Nothing here yet.',
                    style: const TextStyle(color: AppColors.muted))),
              ],
            ),
          )
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  _Row(items[i], _badgeColor(items[i]['badge'] as String?)),
                  if (i < items.length - 1) const Hairline(),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.item, this.badgeColor);
  final Map<String, dynamic> item;
  final Color badgeColor;

  @override
  Widget build(BuildContext context) {
    final subtitle = item['subtitle'] as String?;
    final trailing = item['trailing'] as String?;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 8, height: 8, margin: const EdgeInsets.only(top: 6, right: 12),
            decoration: BoxDecoration(color: badgeColor, shape: BoxShape.circle),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item['title']?.toString() ?? '',
                    style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                if (subtitle != null && subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(subtitle, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                ],
              ],
            ),
          ),
          if (trailing != null && trailing.isNotEmpty) ...[
            const SizedBox(width: 10),
            Text(trailing,
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: badgeColor)),
          ],
        ],
      ),
    );
  }
}
