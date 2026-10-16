import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Which roll a bulk import is filling.
enum ImportKind {
  students,
  staff;

  String get label => this == ImportKind.students ? 'students' : 'staff';
  String get path => this == ImportKind.students
      ? '/api/mobile/v1/admin/import/students'
      : '/api/mobile/v1/admin/import/staff';
  String get title => this == ImportKind.students ? 'Import students' : 'Import staff';
  IconData get icon =>
      this == ImportKind.students ? Icons.group_add_rounded : Icons.badge_rounded;
}

/// Bulk import from a .csv or .xlsx file on the device.
///
/// Two steps, exactly as on the web: the file is previewed first and nothing is
/// written, then the previewed rows are committed. The commit re-validates
/// everything from scratch, so a preview that has gone stale — someone else
/// admitted a student with one of these numbers — is refused rather than
/// half-applied.
class AdminImportScreen extends ConsumerStatefulWidget {
  const AdminImportScreen({super.key, required this.kind});
  final ImportKind kind;

  @override
  ConsumerState<AdminImportScreen> createState() => _AdminImportScreenState();
}

class _AdminImportScreenState extends ConsumerState<AdminImportScreen> {
  String? _filename;
  bool _busy = false;
  /// The preview's own rows, posted back verbatim on commit.
  List<dynamic>? _rows;
  List<Map<String, dynamic>> _issues = const [];
  List<String> _unmatched = const [];
  String? _message;
  bool _ok = false;
  List<Map<String, dynamic>> _createdStaff = const [];
  String? _passwordRule;

  Future<void> _pickAndPreview() async {
    final picked = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['csv', 'xlsx'],
    );
    if (picked.isEmpty) return;
    final file = picked.first;

    // Bytes rather than a path: the web build has no filesystem to point at.
    final Uint8List bytes;
    try {
      bytes = await file.readAsBytes();
    } catch (_) {
      if (mounted) showToast(context, "Couldn't read that file.", error: true);
      return;
    }

    setState(() {
      _busy = true;
      _filename = file.name;
      _rows = null;
      _issues = const [];
      _unmatched = const [];
      _message = null;
      _createdStaff = const [];
    });

    final res = await ref
        .read(apiProvider)
        .postFile(widget.kind.path, bytes: bytes, filename: file.name);
    if (!mounted) return;

    final body = res.body;
    setState(() {
      _busy = false;
      _ok = body?['ok'] == true;
      _message = (body?['message'] ?? body?['error'] ?? 'That file could not be read.')
          .toString();
      _rows = body?['ok'] == true ? (body?['preview'] as List?) : null;
      _issues = ((body?['issues'] as List?) ?? const [])
          .cast<Map<String, dynamic>>();
      _unmatched =
          ((body?['unmatchedColumns'] as List?) ?? const []).map((e) => e.toString()).toList();
      _passwordRule = body?['passwordRule']?.toString();
    });
  }

  Future<void> _commit() async {
    final rows = _rows;
    if (rows == null || rows.isEmpty) return;

    final sure = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Import ${rows.length} ${widget.kind.label}?'),
        content: Text(widget.kind == ImportKind.staff
            ? 'Each row creates a staff record and a sign-in. They are written in one '
                'go — all of them or none.'
            : 'They are written in one go — all of them or none.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Import')),
        ],
      ),
    );
    if (sure != true) return;

    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson(widget.kind.path, {'rows': rows});
    if (!mounted) return;

    final body = res.body;
    setState(() {
      _busy = false;
      _ok = body?['ok'] == true;
      _message =
          (body?['message'] ?? body?['error'] ?? 'The import could not be completed.')
              .toString();
      _issues = ((body?['issues'] as List?) ?? const []).cast<Map<String, dynamic>>();
      _passwordRule = body?['passwordRule']?.toString() ?? _passwordRule;
      _createdStaff =
          ((body?['createdStaff'] as List?) ?? const []).cast<Map<String, dynamic>>();
      if (body?['ok'] == true) _rows = null; // written; nothing left to commit
    });

    if (res.ok) {
      ref.invalidate(widget.kind == ImportKind.students
          ? adminStudentsProvider
          : adminStaffProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    return DetailScaffold(
      title: widget.kind.title,
      subtitle: 'From a .csv or .xlsx file',
      icon: widget.kind.icon,
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('1 · Choose the file',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
              const SizedBox(height: 6),
              Text(
                'The first row must be the column headings. Anything the importer '
                'cannot match is reported before a single ${widget.kind == ImportKind.students ? "student" : "staff member"} is written.',
                style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.45),
              ),
              const SizedBox(height: 14),
              PrimaryButton(
                label: _busy && _filename == null
                    ? 'Reading…'
                    : _filename == null
                        ? 'Choose a file'
                        : _filename!,
                icon: Icons.attach_file_rounded,
                onPressed: _busy ? null : _pickAndPreview,
              ),
            ],
          ),
        ),
        if (_busy) ...[
          const SizedBox(height: 18),
          const SizedBox(height: 60, child: Center(child: CircularProgressIndicator())),
        ],
        if (_message != null) ...[
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: _ok ? AppColors.goodSoft : AppColors.dangerSoft,
              borderRadius: BorderRadius.circular(AppRadius.chip),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(_ok ? Icons.check_circle_outline_rounded : Icons.error_outline_rounded,
                  size: 18, color: _ok ? AppColors.good : AppColors.danger),
              const SizedBox(width: 10),
              Expanded(
                child: Text(_message!,
                    style: TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        fontWeight: FontWeight.w600,
                        color: _ok ? AppColors.good : AppColors.danger)),
              ),
            ]),
          ),
        ],
        if (_unmatched.isNotEmpty) ...[
          const SizedBox(height: 14),
          const SectionLabel('Columns the importer ignored'),
          AppCard(
            child: Text(_unmatched.join(', '),
                style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4)),
          ),
        ],
        if (_issues.isNotEmpty) ...[
          const SizedBox(height: 14),
          SectionLabel('Problems · ${_issues.length}'),
          AppCard(
            child: Column(children: [
              for (var i = 0; i < _issues.length && i < 60; i++) ...[
                if (i > 0) const Hairline(),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(
                      width: 42,
                      alignment: Alignment.centerLeft,
                      child: Text('R${_issues[i]['row']}',
                          style: const TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.danger)),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_issues[i]['column']?.toString() ?? '',
                              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text(_issues[i]['message']?.toString() ?? '',
                              style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        ],
                      ),
                    ),
                  ]),
                ),
              ],
              if (_issues.length > 60)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('…and ${_issues.length - 60} more.',
                      style: const TextStyle(fontSize: 12, color: AppColors.faint)),
                ),
            ]),
          ),
        ],
        if (rows != null && rows.isNotEmpty) ...[
          const SizedBox(height: 18),
          SectionLabel('2 · Ready to import · ${rows.length}'),
          AppCard(
            child: Column(children: [
              for (var i = 0; i < rows.length && i < 15; i++) ...[
                if (i > 0) const Hairline(),
                _PreviewRow(row: (rows[i] as Map).cast<String, dynamic>(), kind: widget.kind),
              ],
              if (rows.length > 15)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text('…and ${rows.length - 15} more.',
                      style: const TextStyle(fontSize: 12, color: AppColors.faint)),
                ),
            ]),
          ),
          if (_passwordRule != null) ...[
            const SizedBox(height: 12),
            AppCard(
              child: Text(_passwordRule!,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.45)),
            ),
          ],
          const SizedBox(height: 18),
          PrimaryButton(
            label: _busy ? 'Importing…' : 'Import ${rows.length} ${widget.kind.label}',
            icon: Icons.cloud_upload_rounded,
            onPressed: _busy ? null : _commit,
          ),
        ],
        if (_createdStaff.isNotEmpty) ...[
          const SizedBox(height: 18),
          SectionLabel('Sign-ins created · ${_createdStaff.length}'),
          AppCard(
            child: Column(children: [
              for (var i = 0; i < _createdStaff.length; i++) ...[
                if (i > 0) const Hairline(),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${_createdStaff[i]['name']} · ${_createdStaff[i]['employeeId']}',
                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 3),
                      SelectableText(
                        '${_createdStaff[i]['email']}  ·  ${_createdStaff[i]['password']}',
                        style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ]),
          ),
          const SizedBox(height: 10),
          const Text(
            'Hand these out now — each person must change their password at first '
            'sign-in, and the passwords are not shown again.',
            style: TextStyle(fontSize: 12, color: AppColors.faint, height: 1.5),
          ),
        ],
      ],
    );
  }
}

class _PreviewRow extends StatelessWidget {
  const _PreviewRow({required this.row, required this.kind});
  final Map<String, dynamic> row;
  final ImportKind kind;

  @override
  Widget build(BuildContext context) {
    final name = [row['firstName'], row['lastName']].where((e) => e != null).join(' ');
    final detail = kind == ImportKind.students
        ? [
            row['admissionNo'],
            if (row['className'] != null) '${row['className']} ${row['sectionName'] ?? ''}'.trim(),
          ].where((e) => e != null).join(' · ')
        : [row['email'], row['roleKey'], row['staffType']]
            .where((e) => e != null)
            .join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name.isEmpty ? 'Row ${row['row']}' : name,
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
              if (detail.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(detail, style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
              ],
            ],
          ),
        ),
        Text('R${row['row']}',
            style: const TextStyle(fontSize: 11, color: AppColors.faint)),
      ]),
    );
  }
}
