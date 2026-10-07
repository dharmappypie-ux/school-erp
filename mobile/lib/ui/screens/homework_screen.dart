import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

final _day = DateFormat('EEE, d MMM');

class HomeworkScreen extends ConsumerWidget {
  const HomeworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final homework = ref.watch(homeworkProvider);

    Future<void> toggle(HomeworkItem h, bool v) async {
      await ref.read(dbProvider).setHomeworkDone(h.id, v);
      refreshData(ref);
      await ref.read(syncProvider).refreshPending();
    }

    final list = homework.value ?? const [];
    final pending = list.where((h) => !h.done).length;

    return DetailScaffold(
      title: 'Homework',
      subtitle: 'Tap the circle to mark a task done',
      icon: Icons.menu_book_rounded,
      onRefresh: () async {
        await ref.read(syncProvider).sync(manual: true);
        refreshData(ref);
      },
      hero: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('DUE THIS WEEK', style: eyebrow(Colors.white.withValues(alpha: 0.85))),
                const SizedBox(height: 6),
                Text('$pending ${pending == 1 ? 'task' : 'tasks'}',
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
            child: const Icon(Icons.assignment_turned_in_rounded, color: Colors.white),
          ),
        ],
      ),
      children: [
        const SectionLabel('Assignments'),
        homework.when(
          loading: () => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
          error: (e, _) => AppCard(child: Text('$e')),
          data: (items) => Column(
            children: [for (final h in items) _HomeworkCard(h, (v) => toggle(h, v))],
          ),
        ),
      ],
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard(this.h, this.onToggle);
  final HomeworkItem h;
  final ValueChanged<bool> onToggle;

  @override
  Widget build(BuildContext context) {
    final overdue = !h.done && h.dueDate.isBefore(DateTime.now());
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        onTap: () => onToggle(!h.done),
        child: Row(
          children: [
            _Check(done: h.done, onTap: () => onToggle(!h.done)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(h.subject.toUpperCase(), style: eyebrow(AppColors.primary)),
                  const SizedBox(height: 3),
                  Text(h.title,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: h.done ? AppColors.faint : AppColors.ink,
                        decoration: h.done ? TextDecoration.lineThrough : null,
                      )),
                  const SizedBox(height: 4),
                  Text(
                    h.done
                        ? 'Completed'
                        : overdue
                            ? 'Overdue · ${_day.format(h.dueDate)}'
                            : 'Due ${_day.format(h.dueDate)}',
                    style: TextStyle(
                        fontSize: 12,
                        color: overdue ? AppColors.danger : AppColors.muted,
                        fontWeight: overdue ? FontWeight.w700 : FontWeight.w500),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Check extends StatelessWidget {
  const _Check({required this.done, required this.onTap});
  final bool done;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: done ? kHeroGradient : null,
            border: done ? null : Border.all(color: AppColors.faint, width: 2),
          ),
          child: done
              ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
              : null,
        ),
      );
}
