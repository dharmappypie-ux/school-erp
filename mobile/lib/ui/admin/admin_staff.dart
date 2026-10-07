import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'create_staff.dart';
import 'edit_staff.dart';
import 'widgets/admin_widgets.dart';

class AdminStaffScreen extends ConsumerWidget {
  const AdminStaffScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminStaffProvider);
    final staff = (async.value?['staff'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async => ref.invalidate(adminStaffProvider),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          AppScreenHeader(
            eyebrowText: 'Admin',
            title: 'Staff',
            trailing: AddButton(onTap: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const CreateStaffScreen()))),
          ),
          const SizedBox(height: 18),
          if (async.isLoading)
            const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
          else if (staff.isEmpty)
            const AppCard(child: Text('No staff yet. Tap + to add one.', style: TextStyle(color: AppColors.muted)))
          else ...[
            Text('${staff.length} active', style: eyebrow(AppColors.muted)),
            const SizedBox(height: 10),
            for (final s in staff)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => EditStaffScreen(staffId: s['id'] as String))),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: AppColors.tealSoft, borderRadius: BorderRadius.circular(13)),
                        child: Text(_initials((s['name'] as String?) ?? ''),
                            style: const TextStyle(color: AppColors.teal, fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text((s['name'] as String?) ?? '',
                                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 2),
                            Text('${s['role']} · ${s['employeeId']}',
                                style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                          ],
                        ),
                      ),
                      _TypeChip(s['staffType'] as String? ?? ''),
                    ],
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(' ');
    return (parts.first.isNotEmpty ? parts.first[0] : '') +
        (parts.length > 1 && parts.last.isNotEmpty ? parts.last[0] : '');
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip(this.type);
  final String type;
  @override
  Widget build(BuildContext context) {
    final label = type.isEmpty
        ? '—'
        : type.split('_').map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase()).join(' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
          color: AppColors.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(label,
          style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.muted)),
    );
  }
}
