import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import 'attendance_screen.dart';
import 'courses_screen.dart';
import 'homework_screen.dart';
import 'results_screen.dart';
import '../modules/module_registry.dart';
import '../widgets/sync_pill.dart';
import '../widgets/widgets.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key, this.onOpenTab});

  /// Switch the shell's bottom tab (2 = Fees, 3 = Alerts/Notices).
  final void Function(int index)? onOpenTab;

  void _open(BuildContext context, Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final student = ref.watch(studentProvider);
    final notices = ref.watch(noticesProvider);
    final homework = ref.watch(homeworkProvider).value ?? const [];
    final dueCount = homework.where((h) => !h.done).length;

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async {
        await ref.read(syncProvider).sync(manual: true);
        refreshData(ref);
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          AppScreenHeader(
            eyebrowText: _greeting(),
            title: 'Dashboard',
            trailing: const SyncPill(),
          ),
          const SizedBox(height: 18),
          student.when(
            loading: () => const _LoadingCard(),
            error: (e, _) => AppCard(child: Text('$e')),
            data: (s) => s == null ? const SizedBox() : _ProfileCard(s),
          ),
          const SizedBox(height: 18),
          // Colourful stat grid — each tile opens its section.
          student.maybeWhen(
            data: (s) => s == null
                ? const SizedBox()
                : Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: StatTile(
                              icon: Icons.fact_check_rounded,
                              value: '${s.attendancePercent}%',
                              label: 'Attendance',
                              color: AppColors.teal,
                              onTap: () => _open(context, const AttendanceScreen()),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: StatTile(
                              icon: Icons.insights_rounded,
                              value: '${s.avgPercent}%',
                              label: 'Term average',
                              color: AppColors.primary,
                              onTap: () => _open(context, const ResultsScreen()),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: StatTile(
                              icon: Icons.menu_book_rounded,
                              value: '$dueCount',
                              label: 'Homework due',
                              color: AppColors.gold,
                              onTap: () => _open(context, const HomeworkScreen()),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: StatTile(
                              icon: Icons.account_balance_wallet_rounded,
                              value: _inr.format(s.feeBalance),
                              label: 'Fees due',
                              color: AppColors.good,
                              onTap: () => onOpenTab?.call(2),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
            orElse: () => const SizedBox(),
          ),
          const SizedBox(height: 22),
          const SectionLabel('Quick access'),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
            child: Column(
              children: [
                RowTile(
                    icon: Icons.fact_check_outlined,
                    iconBg: AppColors.tealSoft,
                    iconColor: AppColors.teal,
                    title: 'Attendance',
                    subtitle: 'Daily record and summary',
                    onTap: () => _open(context, const AttendanceScreen())),
                const Hairline(),
                RowTile(
                    icon: Icons.insights_outlined,
                    iconBg: AppColors.accentSoft,
                    iconColor: AppColors.primary,
                    title: 'Results',
                    subtitle: 'Marks and report cards',
                    onTap: () => _open(context, const ResultsScreen())),
                const Hairline(),
                RowTile(
                    icon: Icons.menu_book_outlined,
                    iconBg: AppColors.warnSoft,
                    iconColor: AppColors.gold,
                    title: 'Homework',
                    subtitle: dueCount == 0 ? 'All caught up' : '$dueCount due this week',
                    onTap: () => _open(context, const HomeworkScreen())),
                const Hairline(),
                if (ref.watch(authProvider).allowsFeature('lms')) ...[
                  RowTile(
                      icon: Icons.play_lesson_outlined,
                      iconBg: AppColors.goodSoft,
                      iconColor: AppColors.good,
                      title: 'Courses & quizzes',
                      subtitle: 'Keep the streak going',
                      onTap: () => _open(context, const CoursesScreen())),
                  const Hairline(),
                ],
                RowTile(
                    icon: Icons.apps_rounded,
                    iconBg: AppColors.accentSoft,
                    iconColor: AppColors.primary,
                    title: 'All features',
                    subtitle: 'Timetable, fees, notices, transport & more',
                    onTap: () => _open(context, const ModulesPage(role: UserRole.parent))),
              ],
            ),
          ),
          const SizedBox(height: 22),
          SectionLabel('Latest notices',
              trailing: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onOpenTab?.call(3),
                child: const Text('View all',
                    style: TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
              )),
          notices.maybeWhen(
            data: (list) => Column(
              children: [
                for (final n in list.take(3))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: AppCard(
                      onTap: () => onOpenTab?.call(3),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            margin: const EdgeInsets.only(top: 6, right: 12),
                            decoration: BoxDecoration(
                                color: n.read ? AppColors.faint : AppColors.primary,
                                shape: BoxShape.circle),
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(n.title,
                                    style: const TextStyle(
                                        fontSize: 14.5, fontWeight: FontWeight.w700)),
                                const SizedBox(height: 3),
                                Text(n.body,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            orElse: () => const SizedBox(),
          ),
        ],
      ),
    );
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard(this.s);
  final Student s;

  @override
  Widget build(BuildContext context) {
    final up = s.trend.length >= 2 ? s.trend.last >= s.trend.first : true;
    return DarkCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: Colors.white.withValues(alpha: 0.18),
                child: Text(_initials(s.name),
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.name,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text('${s.className} · ${s.admissionNo}',
                        style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.qr_code_rounded, color: Colors.white, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text('TERM AVERAGE', style: eyebrow(Colors.white.withValues(alpha: 0.85))),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${s.avgPercent}%',
                  style: const TextStyle(
                      color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800, height: 1)),
              const SizedBox(width: 10),
              Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Text(up ? '▲ trending up' : '▼ trending down',
                    style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Sparkline(s.trend, color: Colors.white),
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

class _LoadingCard extends StatelessWidget {
  const _LoadingCard();
  @override
  Widget build(BuildContext context) => const DarkCard(
        padding: EdgeInsets.all(40),
        child: Center(child: CircularProgressIndicator(color: Colors.white)),
      );
}
