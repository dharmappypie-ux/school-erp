import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../homework/student_homework.dart' show openServerUrl;
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _d = DateFormat('d MMM yyyy');

Color _statusColor(String s) => switch (s) {
      'ENROLLED' || 'ACCEPTED' || 'OFFERED' => AppColors.good,
      'REJECTED' || 'WITHDRAWN' => AppColors.danger,
      'DRAFT' => AppColors.muted,
      _ => AppColors.primary,
    };

/// Full admission application: applicant + guardian detail, event timeline,
/// documents, stage moves, and enrol-as-student (section picker) when ACCEPTED.
class AdminAdmissionDetailScreen extends ConsumerStatefulWidget {
  const AdminAdmissionDetailScreen({super.key, required this.applicationId});
  final String applicationId;
  @override
  ConsumerState<AdminAdmissionDetailScreen> createState() => _S();
}

class _S extends ConsumerState<AdminAdmissionDetailScreen> {
  bool _busy = false;
  Map<String, dynamic>? _section;

  Future<void> _move(String toStatus) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/admissions/move', {
      'applicationId': widget.applicationId, 'toStatus': toStatus,
    });
    _after(res);
  }

  Future<void> _enrol() async {
    if (_section == null) {
      showToast(context, 'Choose a section first.', error: true);
      return;
    }
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/admissions/enrol', {
      'applicationId': widget.applicationId, 'sectionId': _section!['id'],
    });
    _after(res);
  }

  void _after(({bool ok, Map<String, dynamic>? body}) res) {
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Done.' : 'Could not complete.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(adminAdmissionDetailProvider(widget.applicationId));
      ref.invalidate(adminAdmissionsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(adminAdmissionDetailProvider(widget.applicationId));
    final d = async.value;

    return DetailScaffold(
      title: d?['name']?.toString() ?? 'Application',
      subtitle: d != null ? '${d['applicationNo']} · ${d['classLevel']}' : '',
      icon: Icons.how_to_reg_rounded,
      onRefresh: () async => ref.invalidate(adminAdmissionDetailProvider(widget.applicationId)),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (d == null)
          const AppCard(child: Text("Couldn't load this application — pull down to retry.",
              style: TextStyle(color: AppColors.muted)))
        else ...[
          Row(children: [
            StatusChip(
              label: d['statusLabel']?.toString() ?? '',
              color: _statusColor(d['status'] as String? ?? ''),
              bg: _statusColor(d['status'] as String? ?? '').withValues(alpha: 0.12),
            ),
          ]),
          if (d['enrolledAdmissionNo'] != null) ...[
            const SizedBox(height: 12),
            AppCard(child: Row(children: [
              const Icon(Icons.verified_rounded, color: AppColors.good),
              const SizedBox(width: 10),
              Expanded(child: Text('Enrolled as ${d['enrolledAdmissionNo']}',
                  style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.good))),
            ])),
          ],

          // Enrol panel (ACCEPTED only)
          if (d['canManage'] == true && (d['sections'] as List?)?.isNotEmpty == true)
            ..._enrolPanel((d['sections'] as List).cast<Map<String, dynamic>>()),

          // Stage moves
          if (d['canManage'] == true && (d['allowedNext'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 14),
            const SectionLabel('Move to stage'),
            AppCard(child: Wrap(spacing: 8, runSpacing: 8, children: [
              for (final s in (d['allowedNext'] as List).cast<Map<String, dynamic>>())
                GestureDetector(
                  onTap: _busy ? null : () => _move(s['status'] as String),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(color: AppColors.accentSoft, borderRadius: BorderRadius.circular(AppRadius.pill)),
                    child: Text(s['label']?.toString() ?? '',
                        style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 12.5)),
                  ),
                ),
            ])),
          ],

          const SizedBox(height: 16),
          const SectionLabel('Applicant'),
          AppCard(child: Column(children: [
            _kv('Date of birth', _fmtDate(d['applicant']?['dateOfBirth'])),
            _kv('Gender', d['applicant']?['gender']?.toString()),
            _kv('Address', d['applicant']?['address']?.toString()),
            _kv('Previous school', d['applicant']?['previousSchool']?.toString()),
            _kv('Previous %', d['applicant']?['previousPercentage']?.toString()),
            _kv('Entrance score', d['applicant']?['score']?.toString()),
            _kv('Rank', d['applicant']?['rank']?.toString()),
            _kv('Test date', _fmtDate(d['applicant']?['testDate'])),
            _kv('Interview date', _fmtDate(d['applicant']?['interviewDate'])),
            _kv('Application fee', d['applicant']?['applicationFeePaid'] == true ? 'Paid' : 'Unpaid'),
            _kv('Rejection reason', d['applicant']?['rejectionReason']?.toString()),
          ])),

          const SizedBox(height: 16),
          const SectionLabel('Guardian'),
          AppCard(child: Column(children: [
            _kv('Name', d['guardian']?['name']?.toString()),
            _kv('Phone', d['guardian']?['phone']?.toString()),
            _kv('Email', d['guardian']?['email']?.toString()),
            _kv('Relationship', d['guardian']?['relationship']?.toString()),
          ])),

          if ((d['documents'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            SectionLabel('Documents (${(d['documents'] as List).length})'),
            AppCard(child: Column(children: [
              for (final doc in (d['documents'] as List).cast<Map<String, dynamic>>())
                InkWell(
                  onTap: () => openServerUrl(ref, context, doc['url']?.toString() ?? ''),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(children: [
                      Icon(doc['verified'] == true ? Icons.verified_rounded : Icons.description_rounded,
                          size: 18, color: doc['verified'] == true ? AppColors.good : AppColors.muted),
                      const SizedBox(width: 10),
                      Expanded(child: Text(doc['title']?.toString() ?? 'Document',
                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600))),
                      const Icon(Icons.open_in_new_rounded, size: 15, color: AppColors.faint),
                    ]),
                  ),
                ),
            ])),
          ],

          if ((d['events'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            const SectionLabel('Timeline'),
            AppCard(child: Column(children: [
              for (final e in (d['events'] as List).cast<Map<String, dynamic>>())
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Padding(padding: EdgeInsets.only(top: 3), child: Icon(Icons.circle, size: 8, color: AppColors.primary)),
                    const SizedBox(width: 10),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${e['from'] != null ? '${e['from']} → ' : ''}${e['to']}',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                      if ((e['note']?.toString() ?? '').isNotEmpty)
                        Text(e['note'].toString(), style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                      Text(_fmtDate(e['at']) ?? '', style: const TextStyle(fontSize: 11, color: AppColors.faint)),
                    ])),
                  ]),
                ),
            ])),
          ],
        ],
      ],
    );
  }

  List<Widget> _enrolPanel(List<Map<String, dynamic>> sections) {
    final items = sections.where((s) => s['full'] != true).toList();
    Map<String, dynamic>? selected;
    for (final s in items) {
      if (s['id'] == _section?['id']) { selected = s; break; }
    }
    return [
      const SizedBox(height: 14),
      const SectionLabel('Enrol as student'),
      AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Creates the student + guardian logins and the active enrollment.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
        const SizedBox(height: 12),
        AppDropdown<Map<String, dynamic>>(
          label: 'Section',
          required: true,
          value: selected,
          items: items,
          itemLabel: (s) => '${s['name']} · ${s['seatsLeft']} seats',
          onChanged: (s) => setState(() => _section = s),
        ),
        const SizedBox(height: 14),
        PrimaryButton(
          label: _busy ? 'Enrolling…' : 'Enrol as student',
          icon: Icons.person_add_rounded,
          onPressed: _busy ? null : _enrol,
        ),
      ])),
    ];
  }

  String? _fmtDate(dynamic iso) {
    final s = iso?.toString();
    if (s == null || s.isEmpty) return null;
    final dt = DateTime.tryParse(s);
    return dt != null ? _d.format(dt) : null;
  }

  Widget _kv(String k, String? v) {
    if (v == null || v.isEmpty || v == 'null') return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 128, child: Text(k, style: const TextStyle(fontSize: 12.5, color: AppColors.muted))),
        Expanded(child: Text(v, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}
