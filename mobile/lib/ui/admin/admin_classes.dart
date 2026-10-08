import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'create_subject.dart';

/// Classes & subjects: list the classes, drill into a roster + subjects, and
/// add a subject.
class AdminClassesScreen extends ConsumerWidget {
  const AdminClassesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meta = ref.watch(adminMetaProvider);
    final sections = (meta.value?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Classes & subjects',
      subtitle: '${sections.length} classes',
      icon: Icons.meeting_room_rounded,
      onRefresh: () async => ref.invalidate(adminMetaProvider),
      fab: FloatingActionButton.extended(
        backgroundColor: AppColors.primary, foregroundColor: Colors.white,
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateSubjectScreen())),
        icon: const Icon(Icons.add_rounded), label: const Text('Subject'),
      ),
      children: [
        if (meta.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (meta.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else if (sections.isEmpty)
          const AppCard(child: Text('No classes yet.', style: TextStyle(color: AppColors.muted)))
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(children: [
              for (var i = 0; i < sections.length; i++) ...[
                InkWell(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => ClassDetailScreen(sectionId: sections[i]['id'] as String))),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    child: Row(children: [
                      Expanded(child: Text(sections[i]['name']?.toString() ?? '',
                          style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700))),
                      Text('${sections[i]['seatsLeft'] ?? 0} seats left',
                          style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                      const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
                    ]),
                  ),
                ),
                if (i < sections.length - 1) const Hairline(),
              ],
            ]),
          ),
      ],
    );
  }
}

class ClassDetailScreen extends ConsumerStatefulWidget {
  const ClassDetailScreen({super.key, required this.sectionId});
  final String sectionId;
  @override
  ConsumerState<ClassDetailScreen> createState() => _ClassDetailScreenState();
}

class _ClassDetailScreenState extends ConsumerState<ClassDetailScreen> {
  late final Future<Map<String, dynamic>?> _future =
      ref.read(apiProvider).getJson('/api/mobile/v1/admin/class/${widget.sectionId}');

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>?>(
      future: _future,
      builder: (context, snap) {
        final d = snap.data;
        final students = (d?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        final subjects = (d?['subjects'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        return DetailScaffold(
          title: d?['name']?.toString() ?? 'Class',
          subtitle: d == null ? '' : '${students.length} students${d['classTeacher'] != null ? ' · ${d['classTeacher']}' : ''}',
          icon: Icons.meeting_room_rounded,
          children: [
            if (snap.connectionState == ConnectionState.waiting)
              const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
            else if (d == null)
              const AppCard(child: Text("Couldn't load this class.", style: TextStyle(color: AppColors.muted)))
            else ...[
              SectionLabel('Subjects (${subjects.length})'),
              if (subjects.isEmpty)
                const AppCard(child: Text('No subjects assigned.', style: TextStyle(color: AppColors.muted)))
              else
                AppCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Column(children: [
                    for (var i = 0; i < subjects.length; i++) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 11),
                        child: Row(children: [
                          Expanded(child: Text(subjects[i]['name']?.toString() ?? '',
                              style: const TextStyle(fontWeight: FontWeight.w600))),
                          Text(subjects[i]['teacher']?.toString() ?? 'Unassigned',
                              style: TextStyle(fontSize: 12.5, color: subjects[i]['teacher'] == null ? AppColors.faint : AppColors.muted)),
                        ]),
                      ),
                      if (i < subjects.length - 1) const Hairline(),
                    ],
                  ]),
                ),
              const SizedBox(height: 22),
              SectionLabel('Roster (${students.length})'),
              if (students.isEmpty)
                const AppCard(child: Text('No students enrolled.', style: TextStyle(color: AppColors.muted)))
              else
                AppCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Column(children: [
                    for (var i = 0; i < students.length; i++) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(children: [
                          SizedBox(width: 34, child: Text('${students[i]['rollNumber'] ?? ''}',
                              style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 12.5))),
                          Expanded(child: Text(students[i]['name']?.toString() ?? '',
                              style: const TextStyle(fontWeight: FontWeight.w600))),
                          Text(students[i]['admissionNo']?.toString() ?? '',
                              style: const TextStyle(fontSize: 12, color: AppColors.faint)),
                        ]),
                      ),
                      if (i < students.length - 1) const Hairline(),
                    ],
                  ]),
                ),
            ],
          ],
        );
      },
    );
  }
}
