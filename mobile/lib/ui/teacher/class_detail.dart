import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'set_homework.dart';
import 'take_attendance.dart';

class ClassDetailScreen extends ConsumerWidget {
  const ClassDetailScreen({
    super.key,
    required this.sectionId,
    required this.sectionName,
    this.isClassTeacher = false,
  });
  final String sectionId;
  final String sectionName;
  final bool isClassTeacher;

  void _open(BuildContext context, Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(sectionStudentsProvider((sectionId: sectionId, date: null)));
    final students =
        (async.value?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: sectionName,
      subtitle: isClassTeacher ? 'You are the class teacher' : 'Subject class',
      icon: Icons.groups_rounded,
      onRefresh: () async => ref.invalidate(sectionStudentsProvider((sectionId: sectionId, date: null))),
      hero: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('STUDENTS', style: eyebrow(Colors.white.withValues(alpha: 0.85))),
                const SizedBox(height: 6),
                Text('${students.length}',
                    style: const TextStyle(
                        color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800, height: 1)),
              ],
            ),
          ),
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
            child: const Icon(Icons.groups_rounded, color: Colors.white),
          ),
        ],
      ),
      children: [
        Row(
          children: [
            // Only the class teacher may take attendance for a class; a subject
            // teacher sees the roster and can set homework, but not attendance.
            if (isClassTeacher) ...[
              Expanded(
                child: _ActionButton(
                  icon: Icons.fact_check_rounded,
                  label: 'Take attendance',
                  color: AppColors.teal,
                  onTap: () => _open(context,
                      TakeAttendanceScreen(sectionId: sectionId, sectionName: sectionName)),
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: _ActionButton(
                icon: Icons.assignment_add,
                label: 'Set homework',
                color: AppColors.primary,
                onTap: () => _open(context, SetHomeworkScreen(initialSectionId: sectionId)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 22),
        const SectionLabel('Roster'),
        if (async.isLoading)
          const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
        else if (students.isEmpty)
          const AppCard(child: Text('No students enrolled yet.', style: TextStyle(color: AppColors.muted)))
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(
              children: [
                for (var i = 0; i < students.length; i++) ...[
                  _StudentRow(students[i]),
                  if (i < students.length - 1) const Hairline(),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({required this.icon, required this.label, required this.color, required this.onTap});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AppCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 14),
        child: Column(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(13)),
              child: Icon(icon, color: color, size: 23),
            ),
            const SizedBox(height: 12),
            Text(label,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
          ],
        ),
      );
}

class _StudentRow extends StatelessWidget {
  const _StudentRow(this.s);
  final Map<String, dynamic> s;

  @override
  Widget build(BuildContext context) {
    final roll = '${s['rollNumber'] ?? ''}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: AppColors.surfaceSunken, borderRadius: BorderRadius.circular(10)),
            child: Text(roll.isEmpty ? '–' : roll,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(s['name'] as String,
                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
          ),
          Text('${s['admissionNo'] ?? ''}',
              style: const TextStyle(fontSize: 12, color: AppColors.muted)),
        ],
      ),
    );
  }
}
