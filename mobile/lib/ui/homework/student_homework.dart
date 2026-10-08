import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _due = DateFormat('d MMM');
final _dueLong = DateFormat('d MMMM yyyy');

({Color c, Color bg, String label}) _statusStyle(String s) => switch (s) {
      'SUBMITTED' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Submitted'),
      'LATE' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Submitted late'),
      'GRADED' => (c: AppColors.primary, bg: AppColors.accentSoft, label: 'Graded'),
      'MISSING' => (c: AppColors.danger, bg: AppColors.dangerSoft, label: 'Missing'),
      'RESUBMIT' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Resubmit'),
      _ => (c: AppColors.muted, bg: AppColors.line, label: 'To do'),
    };

/// Open a server path (possibly relative, e.g. /uploads/..) in the browser.
Future<void> openServerUrl(WidgetRef ref, BuildContext context, String path) async {
  final url = ref.read(apiProvider).absoluteUrl(path);
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) showToast(context, "Couldn't open that link.", error: true);
}

/// The child's homework, live from the server, with the ability to turn in a
/// written answer and/or a file and see marks/feedback once graded.
class StudentHomeworkScreen extends ConsumerWidget {
  const StudentHomeworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(studentHomeworkProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final offline = !async.isLoading && async.value == null;
    final pending = items.where((h) => h['status'] == 'ASSIGNED' || h['status'] == 'RESUBMIT' || h['status'] == 'MISSING').length;

    return DetailScaffold(
      title: 'Homework',
      subtitle: offline ? 'Not loaded' : '$pending to do · ${items.length} total',
      icon: Icons.menu_book_rounded,
      onRefresh: () async => ref.invalidate(studentHomeworkProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(child: Text("Couldn't reach the school — pull down to retry.",
                  style: TextStyle(color: AppColors.muted))),
            ]),
          )
        else if (items.isEmpty)
          const AppCard(
            child: Row(children: [
              Icon(Icons.inbox_rounded, color: AppColors.faint),
              SizedBox(width: 12),
              Expanded(child: Text('No homework assigned yet.', style: TextStyle(color: AppColors.muted))),
            ]),
          )
        else
          for (final h in items) ...[
            _HomeworkCard(h: h),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard({required this.h});
  final Map<String, dynamic> h;

  @override
  Widget build(BuildContext context) {
    final status = (h['status'] as String?) ?? 'ASSIGNED';
    final st = _statusStyle(status);
    final due = DateTime.tryParse(h['dueOn']?.toString() ?? '');
    final submittedAt = DateTime.tryParse(h['submittedAt']?.toString() ?? '');
    final marks = h['marksObtained'];
    final maxMarks = h['maxMarks'];
    return AppCard(
      onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => HomeworkDetailScreen(h: h))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(h['title']?.toString() ?? '',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
              if (status == 'GRADED' && marks != null) ...[
                StatusChip(label: '$marks / ${maxMarks ?? '—'}', color: AppColors.primary, bg: AppColors.accentSoft),
                const SizedBox(width: 6),
              ],
              StatusChip(label: st.label, color: st.c, bg: st.bg),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${h['subject'] ?? ''}${h['teacher'] != null ? ' · ${h['teacher']}' : ''}',
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 2),
          Text(
            '${due != null ? 'Due ${_due.format(due)}' : ''}'
            '${submittedAt != null ? ' · submitted ${_due.format(submittedAt)}' : ''}',
            style: const TextStyle(fontSize: 12, color: AppColors.faint),
          ),
        ],
      ),
    );
  }
}

/// Detail + submit. The student writes an answer and/or attaches a file (a photo
/// of written work, or a PDF). Once graded it shows the mark and the teacher's
/// feedback (read-only).
class HomeworkDetailScreen extends ConsumerStatefulWidget {
  const HomeworkDetailScreen({super.key, required this.h});
  final Map<String, dynamic> h;
  @override
  ConsumerState<HomeworkDetailScreen> createState() => _HomeworkDetailScreenState();
}

class _HomeworkDetailScreenState extends ConsumerState<HomeworkDetailScreen> {
  late final TextEditingController _answer =
      TextEditingController(text: widget.h['content']?.toString() ?? '');
  bool _saving = false;
  Uint8List? _pickedBytes;
  String? _pickedName;
  String? _pickedMime;

  Future<void> _pickFile() async {
    final files = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
    );
    if (files.isEmpty) return;
    final file = files.first;
    final Uint8List bytes;
    try {
      bytes = await file.readAsBytes();
    } catch (_) {
      if (mounted) showToast(context, "Couldn't read that file.", error: true);
      return;
    }
    if (bytes.length > 10 * 1024 * 1024) {
      if (mounted) showToast(context, 'Files must be 10 MB or smaller.', error: true);
      return;
    }
    setState(() {
      _pickedBytes = bytes;
      _pickedName = file.name;
      _pickedMime = _mimeFor(file.extension);
    });
  }

  String _mimeFor(String? ext) => switch ((ext ?? '').toLowerCase()) {
        'pdf' => 'application/pdf',
        'jpg' || 'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        _ => 'application/octet-stream',
      };

  Future<void> _submit() async {
    final hasText = _answer.text.trim().isNotEmpty;
    if (!hasText && _pickedBytes == null) {
      showToast(context, 'Write your answer or attach your work first.', error: true);
      return;
    }
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'submissionId': widget.h['submissionId'],
      'homeworkId': widget.h['homeworkId'],
      if (hasText) 'content': _answer.text.trim(),
    };
    if (_pickedBytes != null) {
      body['attachment'] = {
        'type': _pickedMime,
        'base64': base64Encode(_pickedBytes!),
      };
    }
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/parent/homework/submit', body);
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Submitted.' : 'Could not submit.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(studentHomeworkProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.h;
    final status = (h['status'] as String?) ?? 'ASSIGNED';
    final graded = status == 'GRADED';
    final due = DateTime.tryParse(h['dueOn']?.toString() ?? '');
    final submittedAt = DateTime.tryParse(h['submittedAt']?.toString() ?? '');
    final worksheetUrl = h['worksheetUrl']?.toString();
    final attachmentUrl = h['attachmentUrl']?.toString();
    final resubmit = submittedAt != null;

    return DetailScaffold(
      title: h['title']?.toString() ?? 'Homework',
      subtitle: '${h['subject'] ?? ''}${due != null ? ' · due ${_due.format(due)}' : ''}',
      icon: Icons.menu_book_rounded,
      children: [
        if ((h['description']?.toString() ?? '').isNotEmpty) ...[
          const SectionLabel('Task'),
          AppCard(child: Text(h['description'].toString(), style: const TextStyle(height: 1.4))),
          const SizedBox(height: 10),
        ],
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (due != null)
                Text('Due ${_dueLong.format(due)}',
                    style: const TextStyle(fontSize: 13, color: AppColors.muted)),
              if (submittedAt != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('Submitted ${_dueLong.format(submittedAt)}',
                      style: const TextStyle(fontSize: 13, color: AppColors.good, fontWeight: FontWeight.w600)),
                ),
              if (worksheetUrl != null && worksheetUrl.isNotEmpty) ...[
                const SizedBox(height: 10),
                _LinkButton(
                  icon: Icons.download_rounded,
                  label: 'Download worksheet',
                  onTap: () => openServerUrl(ref, context, worksheetUrl),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 18),
        if (graded) ...[
          const SectionLabel('Result'),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  h['marksObtained'] != null
                      ? 'Scored ${h['marksObtained']}${h['maxMarks'] != null ? ' / ${h['maxMarks']}' : ''}'
                      : 'Graded',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.primary),
                ),
                if ((h['feedback']?.toString() ?? '').isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text('Feedback: ${h['feedback']}', style: const TextStyle(color: AppColors.muted, height: 1.4)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
          const SectionLabel('Your answer'),
          AppCard(child: Text(h['content']?.toString().isNotEmpty == true ? h['content'].toString() : '—',
              style: const TextStyle(height: 1.4))),
          if (attachmentUrl != null && attachmentUrl.isNotEmpty) ...[
            const SizedBox(height: 10),
            _LinkButton(
              icon: Icons.attach_file_rounded,
              label: 'View your attachment',
              onTap: () => openServerUrl(ref, context, attachmentUrl),
            ),
          ],
        ] else ...[
          const SectionLabel('Your answer'),
          AppTextField(controller: _answer, label: 'Type your answer, or note that you handed in a hard copy', maxLines: 6),
          const SizedBox(height: 14),
          const SectionLabel('Attach your work'),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _pickedName ??
                            (attachmentUrl != null && attachmentUrl.isNotEmpty
                                ? 'A file is already attached'
                                : 'No file chosen'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 13,
                            color: _pickedBytes != null ? AppColors.ink : AppColors.muted),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _saving ? null : _pickFile,
                      icon: const Icon(Icons.upload_file_rounded, size: 18),
                      label: Text(_pickedBytes == null && (attachmentUrl == null || attachmentUrl.isEmpty)
                          ? 'Choose file'
                          : 'Replace file'),
                    ),
                  ],
                ),
                if (attachmentUrl != null && attachmentUrl.isNotEmpty && _pickedBytes == null)
                  _LinkButton(
                    icon: Icons.attach_file_rounded,
                    label: 'View current attachment',
                    onTap: () => openServerUrl(ref, context, attachmentUrl),
                  ),
                const SizedBox(height: 4),
                const Text('A photo of your written work, or a PDF. Up to 10 MB.',
                    style: TextStyle(fontSize: 11.5, color: AppColors.faint)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          PrimaryButton(
            label: _saving ? 'Submitting…' : (resubmit ? 'Resubmit work' : 'Submit homework'),
            icon: Icons.send_rounded,
            onPressed: _saving ? null : _submit,
          ),
          const SizedBox(height: 8),
          const Text(
            'If a parent is submitting for a younger child, that is fine — the teacher sees who filed it.',
            style: TextStyle(fontSize: 11.5, color: AppColors.faint),
          ),
        ],
      ],
    );
  }

  @override
  void dispose() {
    _answer.dispose();
    super.dispose();
  }
}

/// A compact, bordered link-style button for attachments / resources.
class _LinkButton extends StatelessWidget {
  const _LinkButton({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: AppColors.primary),
            const SizedBox(width: 8),
            Text(label,
                style: const TextStyle(
                    fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.primary)),
          ],
        ),
      ),
    );
  }
}
