import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../modules/module_registry.dart';
import '../widgets/widgets.dart';
import 'set_homework.dart';

class TeacherHomeScreen extends ConsumerWidget {
  const TeacherHomeScreen({super.key, required this.onGoToClasses});
  final VoidCallback onGoToClasses;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(teacherOverviewProvider);
    final d = async.value;

    String n(String k) => d == null ? '—' : '${d[k] ?? 0}';

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async => ref.invalidate(teacherOverviewProvider),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          const AppScreenHeader(eyebrowText: 'Teacher', title: 'Dashboard'),
          const SizedBox(height: 18),
          DarkCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(11),
                      decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(14)),
                      child: const Icon(Icons.co_present_rounded, color: Colors.white),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(d?['teacherName']?.toString() ?? 'Teacher',
                              style: const TextStyle(
                                  color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 2),
                          Text(d?['schoolName']?.toString() ?? 'Your school',
                              style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5)),
                        ],
                      ),
                    ),
                  ],
                ),
                if (async.isLoading && d == null) ...[
                  const SizedBox(height: 16),
                  const LinearProgressIndicator(
                      backgroundColor: Colors.white24, color: Colors.white, minHeight: 3),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(child: StatTile(icon: Icons.groups_rounded, value: n('sections'), label: 'My classes', color: AppColors.teal, onTap: onGoToClasses)),
              const SizedBox(width: 12),
              Expanded(child: StatTile(icon: Icons.school_rounded, value: n('students'), label: 'Students', color: AppColors.primary, onTap: onGoToClasses)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: StatTile(icon: Icons.assignment_rounded, value: n('homework'), label: 'Assignments set', color: AppColors.gold)),
              const SizedBox(width: 12),
              Expanded(child: StatTile(icon: Icons.rate_review_rounded, value: n('toGrade'), label: 'To grade', color: AppColors.good)),
            ],
          ),
          const SizedBox(height: 22),
          const SectionLabel('Quick actions'),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
            child: Column(
              children: [
                RowTile(
                  icon: Icons.fact_check_outlined,
                  iconBg: AppColors.tealSoft,
                  iconColor: AppColors.teal,
                  title: 'Take attendance',
                  subtitle: 'Pick a class and mark the register',
                  onTap: onGoToClasses,
                ),
                const Hairline(),
                RowTile(
                  icon: Icons.assignment_add,
                  iconBg: AppColors.accentSoft,
                  iconColor: AppColors.primary,
                  title: 'Set homework',
                  subtitle: 'Assign work to a whole class',
                  onTap: () => Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => const SetHomeworkScreen())),
                ),
                const Hairline(),
                RowTile(
                  icon: Icons.groups_outlined,
                  iconBg: AppColors.warnSoft,
                  iconColor: AppColors.gold,
                  title: 'My classes',
                  subtitle: 'View rosters and class details',
                  onTap: onGoToClasses,
                ),
                const Hairline(),
                RowTile(
                  icon: Icons.apps_rounded,
                  iconBg: AppColors.goodSoft,
                  iconColor: AppColors.good,
                  title: 'All modules',
                  subtitle: 'Timetable, exams, courses, library & more',
                  onTap: () => Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => const ModulesPage(role: UserRole.teacher))),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
