import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../modules/module_list_screen.dart';
import '../modules/module_registry.dart';
import '../widgets/widgets.dart';
import 'create_staff.dart';
import 'create_student.dart';
import 'post_notice.dart';

final _inr = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

class AdminHomeScreen extends ConsumerWidget {
  const AdminHomeScreen({super.key, required this.onGoToStudents, required this.onGoToStaff});
  final VoidCallback onGoToStudents;
  final VoidCallback onGoToStaff;

  void _open(BuildContext c, Widget s) => Navigator.of(c).push(MaterialPageRoute(builder: (_) => s));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminOverviewProvider);
    final d = async.value;
    String n(String k) => d == null ? '—' : '${d[k] ?? 0}';
    final att = d?['todayAttendancePercent'];

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async => ref.invalidate(adminOverviewProvider),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          const AppScreenHeader(eyebrowText: 'Admin', title: 'Dashboard'),
          const SizedBox(height: 18),
          DarkCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(d?['schoolName']?.toString() ?? 'Your school',
                              style: const TextStyle(
                                  color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 2),
                          Text('Managed by ${d?['adminName'] ?? 'admin'}',
                              style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5)),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(11),
                      decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(14)),
                      child: const Icon(Icons.admin_panel_settings_rounded, color: Colors.white),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: _HeroStat(
                        label: "TODAY'S ATTENDANCE",
                        value: att == null ? '—' : '$att%',
                        hint: d != null && att == null ? 'Not marked yet' : null,
                      ),
                    ),
                    Container(width: 1, height: 36, color: Colors.white.withValues(alpha: 0.2)),
                    Expanded(
                      child: _HeroStat(
                        label: 'FEES COLLECTED',
                        value: d == null ? '—' : _inr.format((d['feeCollected'] ?? 0) as num),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(child: StatTile(icon: Icons.school_rounded, value: n('students'), label: 'Students', color: AppColors.primary, onTap: onGoToStudents)),
              const SizedBox(width: 12),
              Expanded(child: StatTile(icon: Icons.badge_rounded, value: n('staff'), label: 'Staff', color: AppColors.teal, onTap: onGoToStaff)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: StatTile(
                icon: Icons.meeting_room_rounded,
                value: n('sections'),
                label: 'Classes',
                color: AppColors.gold,
                onTap: () => _open(context, const ModuleListScreen(
                    role: 'admin', name: 'classes', title: 'Classes & subjects', icon: Icons.meeting_room_rounded)),
              )),
              const SizedBox(width: 12),
              Expanded(child: StatTile(
                icon: Icons.receipt_long_rounded,
                value: d == null ? '—' : _inr.format((d['feeDue'] ?? 0) as num),
                label: 'Fees due',
                color: AppColors.danger,
                onTap: () => _open(context, const ModuleListScreen(
                    role: 'admin', name: 'fees', title: 'Fees', icon: Icons.receipt_long_rounded)),
              )),
            ],
          ),
          const SizedBox(height: 22),
          AppCard(
            onTap: () => _open(context, const ModulesPage(role: UserRole.admin)),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                      gradient: kHeroGradient, borderRadius: BorderRadius.circular(13)),
                  child: const Icon(Icons.apps_rounded, color: Colors.white),
                ),
                const SizedBox(width: 14),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('All modules',
                          style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700)),
                      SizedBox(height: 2),
                      Text('Admissions, fees, exams, transport, library & more',
                          style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const SectionLabel('Manage'),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
            child: Column(
              children: [
                RowTile(
                  icon: Icons.person_add_alt_1_rounded,
                  iconBg: AppColors.accentSoft,
                  iconColor: AppColors.primary,
                  title: 'Admit a student',
                  subtitle: 'Create student, guardian & logins',
                  onTap: () => _open(context, const CreateStudentScreen()),
                ),
                const Hairline(),
                RowTile(
                  icon: Icons.badge_outlined,
                  iconBg: AppColors.tealSoft,
                  iconColor: AppColors.teal,
                  title: 'Add staff',
                  subtitle: 'Teachers and other employees',
                  onTap: () => _open(context, const CreateStaffScreen()),
                ),
                const Hairline(),
                RowTile(
                  icon: Icons.campaign_rounded,
                  iconBg: AppColors.warnSoft,
                  iconColor: AppColors.gold,
                  title: 'Post a notice',
                  subtitle: 'Broadcast to the whole school',
                  onTap: () => _open(context, const PostNoticeScreen()),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.label, required this.value, this.hint});
  final String label;
  final String value;
  final String? hint;
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: eyebrow(Colors.white.withValues(alpha: 0.85))),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
          if (hint != null)
            Text(hint!,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 11)),
        ],
      );
}
