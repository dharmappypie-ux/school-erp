import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'edit_student.dart';
import 'student_attendance.dart';

final _day = DateFormat('d MMM yyyy');

({Color c, Color bg}) _invTone(String s, bool overdue) {
  if (overdue) return (c: AppColors.danger, bg: AppColors.dangerSoft);
  return switch (s) {
    'PAID' => (c: AppColors.good, bg: AppColors.goodSoft),
    'PARTIALLY_PAID' => (c: AppColors.warn, bg: AppColors.warnSoft),
    _ => (c: AppColors.primary, bg: AppColors.accentSoft),
  };
}

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// Rich student profile mirroring the website's detail page: headline stats
/// (attendance, average score, fees, library), guardian, recent marks, and an
/// Edit / promote action.
class StudentDetailScreen extends ConsumerStatefulWidget {
  const StudentDetailScreen({super.key, required this.studentId});
  final String studentId;
  @override
  ConsumerState<StudentDetailScreen> createState() => _StudentDetailScreenState();
}

class _StudentDetailScreenState extends ConsumerState<StudentDetailScreen> {
  int _reload = 0;
  late Future<Map<String, dynamic>?> _future = _load();

  Future<Map<String, dynamic>?> _load() =>
      ref.read(apiProvider).getJson('/api/mobile/v1/admin/student/${widget.studentId}');

  void _refresh() => setState(() {
        _reload++;
        _future = _load();
      });

  String? _fmtDate(dynamic iso) {
    final s = iso?.toString();
    if (s == null || s.isEmpty) return null;
    final dt = DateTime.tryParse(s);
    return dt != null ? _day.format(dt) : null;
  }

  Widget _kv(String k, String? v) {
    if (v == null || v.isEmpty || v == 'null') return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 130, child: Text(k, style: const TextStyle(fontSize: 12.5, color: AppColors.muted))),
        Expanded(child: Text(v, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600))),
      ]),
    );
  }

  Widget _money(String label, dynamic amount, {bool danger = false}) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.faint, letterSpacing: 0.5)),
          const SizedBox(height: 3),
          Text(_inr.format((amount ?? 0) as num),
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: danger ? AppColors.danger : AppColors.ink)),
        ],
      );

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>?>(
      key: ValueKey(_reload),
      future: _future,
      builder: (context, snap) {
        final d = snap.data;
        final stats = (d?['stats'] as Map?)?.cast<String, dynamic>() ?? const {};
        final marks = (d?['recentMarks'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        final personal = (d?['personal'] as Map?)?.cast<String, dynamic>() ?? const {};
        final services = (d?['services'] as Map?)?.cast<String, dynamic>() ?? const {};
        final guardians = (d?['guardians'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        final fees = (d?['fees'] as Map?)?.cast<String, dynamic>() ?? const {};
        final invoices = (fees['invoices'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        final payments = (d?['payments'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        final reportCards = (d?['reportCards'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

        return DetailScaffold(
          title: d == null ? 'Student' : '${d['firstName']} ${d['lastName'] ?? ''}'.trim(),
          subtitle: d == null ? '' : '${d['admissionNo'] ?? ''} · ${d['className'] ?? ''}',
          icon: Icons.school_rounded,
          onRefresh: () async => _refresh(),
          children: [
            if (snap.connectionState == ConnectionState.waiting)
              const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
            else if (d == null)
              const AppCard(child: Text("Couldn't load this student.", style: TextStyle(color: AppColors.muted)))
            else ...[
              Row(children: [
                StatusChip(
                  label: (d['status'] as String? ?? '').toLowerCase(),
                  color: d['status'] == 'ACTIVE' ? AppColors.good : AppColors.muted,
                  bg: d['status'] == 'ACTIVE' ? AppColors.goodSoft : AppColors.line,
                ),
                const Spacer(),
                PrimaryButton(
                  label: 'Edit / promote',
                  icon: Icons.edit_rounded,
                  expand: false,
                  onPressed: () async {
                    await Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => EditStudentScreen(studentId: widget.studentId)));
                    _refresh();
                  },
                ),
              ]),
              const SizedBox(height: 18),
              Row(children: [
                Expanded(child: _StatCard(
                  label: 'Attendance',
                  value: stats['attendancePercent'] == null ? '—' : '${stats['attendancePercent']}%',
                  sub: '${stats['attendancePresent'] ?? 0} of ${stats['attendanceTotal'] ?? 0} · tap',
                  color: AppColors.teal,
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => StudentAttendanceScreen(studentId: widget.studentId))),
                )),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(
                  label: 'Average score',
                  value: stats['averageScore'] == null ? '—' : '${stats['averageScore']}%',
                  sub: '${stats['assessments'] ?? 0} assessments',
                  color: AppColors.primary,
                )),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _StatCard(
                  label: 'Fees outstanding',
                  value: _inr.format((stats['feesOutstanding'] ?? 0) as num),
                  sub: (stats['feesOutstanding'] ?? 0) == 0 ? 'All settled' : 'Due',
                  color: (stats['feesOutstanding'] ?? 0) == 0 ? AppColors.good : AppColors.danger,
                )),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(
                  label: 'Library',
                  value: '${stats['booksOnLoan'] ?? 0}',
                  sub: 'books on loan',
                  color: AppColors.gold,
                )),
              ]),
              const SizedBox(height: 22),

              // Services
              const SectionLabel('Services'),
              AppCard(child: Column(children: [
                _kv('Class teacher', services['classTeacher']?.toString()),
                _kv('Roll number', services['rollNumber']?.toString()),
                _kv('Transport', services['transport'] == null ? null :
                    '${(services['transport'] as Map)['route'] ?? ''} · ${(services['transport'] as Map)['stop'] ?? ''}'),
                _kv('Hostel', services['hostel'] == null ? null :
                    '${(services['hostel'] as Map)['hostel'] ?? ''} · Room ${(services['hostel'] as Map)['room'] ?? ''}'),
                _kv('Documents', '${services['documents'] ?? 0} on file'),
              ])),
              const SizedBox(height: 22),

              // Guardians
              if (guardians.isNotEmpty) ...[
                SectionLabel('Guardians (${guardians.length})'),
                for (final g in guardians)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(g['name']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700))),
                        if (g['isPrimary'] == true) const StatusChip(label: 'Primary', color: AppColors.primary, bg: AppColors.accentSoft),
                        if (g['isFeePayer'] == true) ...[
                          const SizedBox(width: 6),
                          const StatusChip(label: 'Fee payer', color: AppColors.good, bg: AppColors.goodSoft),
                        ],
                      ]),
                      const SizedBox(height: 2),
                      Text('${g['relationship'] ?? ''} · ${g['phone'] ?? ''}${g['occupation'] != null ? ' · ${g['occupation']}' : ''}',
                          style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                      if ((g['email']?.toString() ?? '').isNotEmpty)
                        Text(g['email'].toString(), style: const TextStyle(fontSize: 12, color: AppColors.faint)),
                    ])),
                  ),
                const SizedBox(height: 12),
              ],

              // Personal details
              const SectionLabel('Personal details'),
              AppCard(child: Column(children: [
                _kv('Date of birth', _fmtDate(personal['dateOfBirth'])),
                _kv('Gender', d['gender']?.toString()),
                _kv('Blood group', personal['bloodGroup']?.toString()),
                _kv('Category', personal['category']?.toString()),
                _kv('Nationality', personal['nationality']?.toString()),
                _kv('Religion', personal['religion']?.toString()),
                _kv('Admitted on', _fmtDate(personal['admissionDate'])),
                _kv('Previous school', personal['previousSchool']?.toString()),
                _kv('Address', personal['address']?.toString()),
                _kv('Emergency contact', personal['emergencyContact']?.toString()),
              ])),
              const SizedBox(height: 22),

              // Fee history
              const SectionLabel('Fee history'),
              AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: _money('Billed', fees['billed'])),
                  Expanded(child: _money('Paid', fees['paid'])),
                  Expanded(child: _money('Due', fees['outstanding'], danger: (fees['outstanding'] ?? 0) > 0)),
                ]),
                if (invoices.isNotEmpty) ...[
                  const SizedBox(height: 10), const Hairline(), const SizedBox(height: 8),
                  for (final inv in invoices)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(inv['period']?.toString() ?? inv['invoiceNo']?.toString() ?? 'Invoice',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          Text('due ${_fmtDate(inv['dueDate']) ?? ''}', style: const TextStyle(fontSize: 11.5, color: AppColors.faint)),
                        ])),
                        Text(_inr.format((inv['total'] ?? 0) as num), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                        const SizedBox(width: 8),
                        StatusChip(
                          label: (inv['status'] as String? ?? '').replaceAll('_', ' ').toLowerCase(),
                          color: _invTone(inv['status'] as String? ?? '', false).c,
                          bg: _invTone(inv['status'] as String? ?? '', false).bg,
                        ),
                      ]),
                    ),
                ],
              ])),
              const SizedBox(height: 22),

              // Receipts
              if (payments.isNotEmpty) ...[
                const SectionLabel('Receipts'),
                AppCard(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), child: Column(children: [
                  for (int i = 0; i < payments.length; i++) ...[
                    Padding(padding: const EdgeInsets.symmetric(vertical: 9), child: Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(payments[i]['receiptNo']?.toString() ?? '—', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        Text('${_fmtDate(payments[i]['paidAt']) ?? ''} · ${(payments[i]['mode']?.toString() ?? '').replaceAll('_', ' ').toLowerCase()}',
                            style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
                      ])),
                      Text(_inr.format((payments[i]['amount'] ?? 0) as num),
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.good)),
                    ])),
                    if (i < payments.length - 1) const Hairline(),
                  ],
                ])),
                const SizedBox(height: 22),
              ],

              // Report cards
              if (reportCards.isNotEmpty) ...[
                const SectionLabel('Report cards'),
                AppCard(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), child: Column(children: [
                  for (int i = 0; i < reportCards.length; i++) ...[
                    Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Row(children: [
                      Expanded(child: Text(reportCards[i]['term']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w600))),
                      Text('${reportCards[i]['percentage'] ?? '—'}% · ${reportCards[i]['grade'] ?? ''}'
                          '${reportCards[i]['rank'] != null ? ' · rank ${reportCards[i]['rank']}' : ''}',
                          style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                      const SizedBox(width: 8),
                      StatusChip(
                        label: reportCards[i]['published'] == true ? 'Published' : 'Draft',
                        color: reportCards[i]['published'] == true ? AppColors.good : AppColors.muted,
                        bg: reportCards[i]['published'] == true ? AppColors.goodSoft : AppColors.line,
                      ),
                    ])),
                    if (i < reportCards.length - 1) const Hairline(),
                  ],
                ])),
                const SizedBox(height: 22),
              ],

              const SectionLabel('Recent marks'),
              if (marks.isEmpty)
                const AppCard(child: Text('No marks recorded yet.', style: TextStyle(color: AppColors.muted)))
              else
                AppCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Column(children: [
                    for (var i = 0; i < marks.length; i++) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(children: [
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(marks[i]['subject']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text(marks[i]['exam']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                          ])),
                          Text(marks[i]['score']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                        ]),
                      ),
                      if (i < marks.length - 1) const Hairline(),
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

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.sub, required this.color, this.onTap});
  final String label;
  final String value;
  final String sub;
  final Color color;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => AppCard(
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: eyebrow(AppColors.muted)),
          const SizedBox(height: 6),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 2),
          Text(sub, style: const TextStyle(fontSize: 11.5, color: AppColors.faint)),
        ]),
      );
}
