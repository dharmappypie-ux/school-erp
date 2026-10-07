import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';
import 'add_book.dart';

final _due = DateFormat('d MMM');

/// Library hub for admins: add a book, issue a copy, return a copy.
class AdminLibraryScreen extends ConsumerWidget {
  const AdminLibraryScreen({super.key});
  void _open(BuildContext c, Widget s) => Navigator.of(c).push(MaterialPageRoute(builder: (_) => s));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final issued = ref.watch(libraryIssuedProvider);
    final onLoan = (issued.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Library',
      subtitle: 'Catalogue & circulation',
      icon: Icons.local_library_rounded,
      onRefresh: () async {
        ref.invalidate(libraryIssuedProvider);
        ref.invalidate(libraryAvailableProvider);
      },
      children: [
        const SectionLabel('Actions'),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
          child: Column(children: [
            RowTile(
              icon: Icons.add_rounded, iconBg: AppColors.tealSoft, iconColor: AppColors.teal,
              title: 'Add book', subtitle: 'Add a title to the catalogue',
              onTap: () => _open(context, const AddBookScreen()),
            ),
            const Hairline(),
            RowTile(
              icon: Icons.book_rounded, iconBg: AppColors.accentSoft, iconColor: AppColors.primary,
              title: 'Issue a copy', subtitle: 'Lend a book to a student',
              onTap: () => _open(context, const IssueBookScreen()),
            ),
            const Hairline(),
            RowTile(
              icon: Icons.assignment_returned_rounded, iconBg: AppColors.goodSoft, iconColor: AppColors.good,
              title: 'Return a copy', subtitle: 'Check a book back in',
              onTap: () => _open(context, const ReturnBookScreen()),
            ),
          ]),
        ),
        const SizedBox(height: 22),
        SectionLabel('On loan (${onLoan.length})'),
        if (issued.isLoading)
          const SizedBox(height: 80, child: Center(child: CircularProgressIndicator()))
        else if (onLoan.isEmpty)
          const AppCard(child: Text('Nothing is on loan right now.', style: TextStyle(color: AppColors.muted)))
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(children: [
              for (var i = 0; i < onLoan.length && i < 25; i++) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  child: Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(onLoan[i]['title']?.toString() ?? '', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                      Text('${onLoan[i]['borrower'] ?? ''} · ${onLoan[i]['accessionNo'] ?? ''}',
                          style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                    ])),
                    _DueChip(onLoan[i]),
                  ]),
                ),
                if (i < onLoan.length - 1 && i < 24) const Hairline(),
              ],
            ]),
          ),
      ],
    );
  }
}

class _DueChip extends StatelessWidget {
  const _DueChip(this.r);
  final Map<String, dynamic> r;
  @override
  Widget build(BuildContext context) {
    final overdue = r['overdue'] == true;
    final d = DateTime.tryParse(r['dueOn']?.toString() ?? '');
    return StatusChip(
      label: d != null ? 'due ${_due.format(d)}' : 'on loan',
      color: overdue ? AppColors.danger : AppColors.muted,
      bg: overdue ? AppColors.dangerSoft : AppColors.line,
    );
  }
}

/// Pick an available copy + a student → issue.
class IssueBookScreen extends ConsumerStatefulWidget {
  const IssueBookScreen({super.key});
  @override
  ConsumerState<IssueBookScreen> createState() => _IssueBookScreenState();
}

class _IssueBookScreenState extends ConsumerState<IssueBookScreen> {
  String? _copyId;
  String? _studentId;
  bool _saving = false;

  Future<void> _issue() async {
    if (_copyId == null || _studentId == null) {
      showToast(context, 'Pick a copy and a student.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/library/issue', {
      'copyId': _copyId, 'studentId': _studentId,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Issued.' : 'Could not issue.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(libraryAvailableProvider);
      ref.invalidate(libraryIssuedProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final copies = ref.watch(libraryAvailableProvider);
    final cItems = (copies.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final students = ref.watch(adminStudentsProvider);
    final sItems = (students.value?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Issue a copy',
      subtitle: 'Lend a book to a student',
      icon: Icons.book_rounded,
      children: [
        if (copies.isLoading)
          const SizedBox(height: 100, child: Center(child: CircularProgressIndicator()))
        else ...[
          const SectionLabel('Book copy'),
          AppDropdown<String>(
            label: 'Available copy',
            value: _copyId,
            items: cItems.map((c) => c['id'] as String).toList(),
            itemLabel: (id) {
              final c = cItems.firstWhere((e) => e['id'] == id, orElse: () => const {});
              return '${c['title'] ?? id} · ${c['accessionNo'] ?? ''}';
            },
            onChanged: (v) => setState(() => _copyId = v),
          ),
          const SizedBox(height: 16),
          const SectionLabel('Borrower'),
          AppDropdown<String>(
            label: 'Student',
            value: _studentId,
            items: sItems.map((s) => s['id'] as String).toList(),
            itemLabel: (id) {
              final s = sItems.firstWhere((e) => e['id'] == id, orElse: () => const {});
              return '${s['name'] ?? id} · ${s['className'] ?? ''}';
            },
            onChanged: (v) => setState(() => _studentId = v),
          ),
          const SizedBox(height: 24),
          PrimaryButton(
            label: _saving ? 'Issuing…' : 'Issue book',
            icon: Icons.check_rounded,
            onPressed: _saving ? null : _issue,
          ),
        ],
      ],
    );
  }
}

/// Pick a loaned copy → return.
class ReturnBookScreen extends ConsumerStatefulWidget {
  const ReturnBookScreen({super.key});
  @override
  ConsumerState<ReturnBookScreen> createState() => _ReturnBookScreenState();
}

class _ReturnBookScreenState extends ConsumerState<ReturnBookScreen> {
  String? _issueId;
  bool _saving = false;

  Future<void> _return() async {
    if (_issueId == null) {
      showToast(context, 'Pick a book to return.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/library/return', {'issueId': _issueId});
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Returned.' : 'Could not return.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(libraryIssuedProvider);
      ref.invalidate(libraryAvailableProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final issued = ref.watch(libraryIssuedProvider);
    final items = (issued.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Return a copy',
      subtitle: 'Check a book back in',
      icon: Icons.assignment_returned_rounded,
      children: [
        if (issued.isLoading)
          const SizedBox(height: 100, child: Center(child: CircularProgressIndicator()))
        else if (items.isEmpty)
          const AppCard(child: Text('Nothing is on loan.', style: TextStyle(color: AppColors.muted)))
        else ...[
          const SectionLabel('On loan'),
          AppDropdown<String>(
            label: 'Book',
            value: _issueId,
            items: items.map((i) => i['id'] as String).toList(),
            itemLabel: (id) {
              final i = items.firstWhere((e) => e['id'] == id, orElse: () => const {});
              return '${i['title'] ?? id} · ${i['borrower'] ?? ''}';
            },
            onChanged: (v) => setState(() => _issueId = v),
          ),
          const SizedBox(height: 24),
          PrimaryButton(
            label: _saving ? 'Returning…' : 'Return book',
            icon: Icons.check_rounded,
            onPressed: _saving ? null : _return,
          ),
        ],
      ],
    );
  }
}
