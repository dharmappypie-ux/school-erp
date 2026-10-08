import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

({Color c, Color bg}) _st(String s) => switch (s) {
      'PUBLISHED' => (c: AppColors.good, bg: AppColors.goodSoft),
      'ARCHIVED' => (c: AppColors.muted, bg: AppColors.line),
      _ => (c: AppColors.warn, bg: AppColors.warnSoft),
    };

/// Quizzes: create a draft, publish/archive. (Questions are added on the web.)
class AdminQuizzesScreen extends ConsumerWidget {
  const AdminQuizzesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminQuizzesProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Quizzes',
      subtitle: '${items.length} quizzes',
      icon: Icons.quiz_rounded,
      onRefresh: () async => ref.invalidate(adminQuizzesProvider),
      fab: FloatingActionButton.extended(
        backgroundColor: AppColors.primary, foregroundColor: Colors.white,
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _QuizForm())),
        icon: const Icon(Icons.add_rounded), label: const Text('New'),
      ),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (async.value == null)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.", style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Text('No quizzes yet. Tap New to create one.', style: TextStyle(color: AppColors.muted)))
        else
          for (final q in items) ...[
            _QuizCard(q: q),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _QuizCard extends ConsumerStatefulWidget {
  const _QuizCard({required this.q});
  final Map<String, dynamic> q;
  @override
  ConsumerState<_QuizCard> createState() => _QuizCardState();
}

class _QuizCardState extends ConsumerState<_QuizCard> {
  bool _busy = false;

  Future<void> _set(String status) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/quizzes/status', {
      'quizId': widget.q['id'], 'status': status,
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Done.' : 'Could not update.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(adminQuizzesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final q = widget.q;
    final status = (q['status'] as String?) ?? 'DRAFT';
    final st = _st(status);
    final questions = (q['questions'] as num?)?.toInt() ?? 0;
    return AppCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(q['title']?.toString() ?? '', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
          StatusChip(label: status[0] + status.substring(1).toLowerCase(), color: st.c, bg: st.bg),
        ]),
        const SizedBox(height: 4),
        Text('${q['subject'] ?? ''} · $questions question(s)', style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
        const SizedBox(height: 12),
        Wrap(spacing: 8, children: [
          if (status != 'PUBLISHED') _chip('Publish', _busy ? null : () => _set('PUBLISHED')),
          if (status != 'ARCHIVED') _chip('Archive', _busy ? null : () => _set('ARCHIVED')),
          if (status != 'DRAFT') _chip('Back to draft', _busy ? null : () => _set('DRAFT')),
        ]),
      ]),
    );
  }

  Widget _chip(String label, VoidCallback? onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          decoration: BoxDecoration(color: AppColors.accentSoft, borderRadius: BorderRadius.circular(AppRadius.pill)),
          child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 13)),
        ),
      );
}

class _QuizForm extends ConsumerStatefulWidget {
  const _QuizForm();
  @override
  ConsumerState<_QuizForm> createState() => _QuizFormState();
}

class _QuizFormState extends ConsumerState<_QuizForm> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  String? _subjectId;
  bool _saving = false;

  Future<void> _save() async {
    if (_title.text.trim().length < 2) {
      showToast(context, 'Enter a quiz title.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/quizzes', {
      'title': _title.text.trim(),
      if (_desc.text.trim().isNotEmpty) 'description': _desc.text.trim(),
      if (_subjectId != null) 'subjectId': _subjectId,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Created.' : 'Could not create.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminQuizzesProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final meta = ref.watch(adminMetaProvider);
    final subjects = (meta.value?['subjects'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    return DetailScaffold(
      title: 'New quiz',
      subtitle: 'Create a draft',
      icon: Icons.quiz_rounded,
      children: [
        const SectionLabel('Quiz'),
        AppTextField(controller: _title, label: 'Title', required: true),
        const SizedBox(height: 16),
        AppTextField(controller: _desc, label: 'Description', hint: 'Optional', maxLines: 3),
        if (subjects.isNotEmpty) ...[
          const SizedBox(height: 16),
          AppDropdown<String>(
            label: 'Subject (optional)',
            value: _subjectId,
            items: subjects.map((s) => s['id'] as String).toList(),
            itemLabel: (id) => (subjects.firstWhere((s) => s['id'] == id, orElse: () => const {})['name'] as String?) ?? id,
            onChanged: (v) => setState(() => _subjectId = v),
          ),
        ],
        const SizedBox(height: 24),
        PrimaryButton(label: _saving ? 'Creating…' : 'Create quiz', icon: Icons.check_rounded, onPressed: _saving ? null : _save),
        const SizedBox(height: 8),
        const Center(child: Text('Add questions on the web, then publish here.',
            style: TextStyle(fontSize: 12, color: AppColors.faint))),
      ],
    );
  }

  @override
  void dispose() {
    _title.dispose(); _desc.dispose();
    super.dispose();
  }
}
