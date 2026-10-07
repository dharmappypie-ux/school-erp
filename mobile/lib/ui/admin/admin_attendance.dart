import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../teacher/take_attendance.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Admin attendance: pick any class and open its register to mark/edit today's
/// attendance (reuses the same register the teacher uses), plus today's totals.
class AdminAttendanceScreen extends ConsumerStatefulWidget {
  const AdminAttendanceScreen({super.key});
  @override
  ConsumerState<AdminAttendanceScreen> createState() => _AdminAttendanceScreenState();
}

class _AdminAttendanceScreenState extends ConsumerState<AdminAttendanceScreen> {
  String? _sectionId;

  @override
  Widget build(BuildContext context) {
    final meta = ref.watch(adminMetaProvider);
    final sections = (meta.value?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final today = ref.watch(moduleProvider((role: 'admin', name: 'attendance')));
    final totals = (today.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    String sectionName(String id) {
      final s = sections.firstWhere((e) => e['id'] == id, orElse: () => const {});
      return (s['name'] as String?) ?? 'Class';
    }

    return DetailScaffold(
      title: 'Attendance',
      subtitle: 'Mark or edit a class register',
      icon: Icons.fact_check_rounded,
      onRefresh: () async {
        ref.invalidate(adminMetaProvider);
        ref.invalidate(moduleProvider((role: 'admin', name: 'attendance')));
      },
      children: [
        const SectionLabel('Take / edit a register'),
        if (meta.isLoading)
          const AppCard(child: Row(children: [
            SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 12), Text('Loading classes…', style: TextStyle(color: AppColors.muted)),
          ]))
        else if (meta.value == null)
          AppCard(child: Row(children: [
            const Icon(Icons.cloud_off_rounded, color: AppColors.warn),
            const SizedBox(width: 12),
            const Expanded(child: Text("Couldn't load classes — pull down to retry.",
                style: TextStyle(color: AppColors.muted))),
            TextButton(onPressed: () => ref.invalidate(adminMetaProvider), child: const Text('Retry')),
          ]))
        else ...[
          AppDropdown<String>(
            label: 'Class',
            value: _sectionId,
            items: sections.map((s) => s['id'] as String).toList(),
            itemLabel: (id) => sectionName(id),
            onChanged: (v) => setState(() => _sectionId = v),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: 'Open class register',
            icon: Icons.arrow_forward_rounded,
            onPressed: _sectionId == null
                ? null
                : () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => TakeAttendanceScreen(
                        sectionId: _sectionId!, sectionName: sectionName(_sectionId!)))),
          ),
        ],
        const SizedBox(height: 24),
        const SectionLabel("Today's totals"),
        if (today.isLoading)
          const SizedBox(height: 80, child: Center(child: CircularProgressIndicator()))
        else if (totals.isEmpty)
          const AppCard(child: Text('No attendance marked yet today.',
              style: TextStyle(color: AppColors.muted)))
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(children: [
              for (var i = 0; i < totals.length; i++) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(children: [
                    Expanded(child: Text(totals[i]['title']?.toString() ?? '',
                        style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600))),
                    Text(totals[i]['trailing']?.toString() ?? '',
                        style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800)),
                  ]),
                ),
                if (i < totals.length - 1) const Hairline(),
              ],
            ]),
          ),
      ],
    );
  }
}
