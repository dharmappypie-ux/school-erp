import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'create_student.dart';
import 'edit_student.dart';
import 'widgets/admin_widgets.dart';

class AdminStudentsScreen extends ConsumerWidget {
  const AdminStudentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminStudentsProvider);
    final students = (async.value?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async => ref.invalidate(adminStudentsProvider),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          AppScreenHeader(
            eyebrowText: 'Admin',
            title: 'Students',
            trailing: AddButton(onTap: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const CreateStudentScreen()))),
          ),
          const SizedBox(height: 18),
          if (async.isLoading)
            const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
          else if (students.isEmpty)
            const AppCard(child: Text('No students yet. Tap + to admit one.', style: TextStyle(color: AppColors.muted)))
          else ...[
            Text('${students.length} active', style: eyebrow(AppColors.muted)),
            const SizedBox(height: 10),
            for (final s in students)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => EditStudentScreen(studentId: s['id'] as String))),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: AppColors.accentSoft, borderRadius: BorderRadius.circular(13)),
                        child: Text(_initials((s['name'] as String?) ?? ''),
                            style: const TextStyle(
                                color: AppColors.primary, fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text((s['name'] as String?) ?? '',
                                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 2),
                            Text('${s['className']} · ${s['admissionNo']}',
                                style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
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
