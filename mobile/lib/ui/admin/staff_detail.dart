import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'edit_staff.dart';

String _pretty(String s) => s.isEmpty ? '' : s[0] + s.substring(1).toLowerCase().replaceAll('_', ' ');
final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _day = DateFormat('d MMM yyyy');
String? _fmtDate(dynamic iso) {
  final s = iso?.toString();
  if (s == null || s.isEmpty) return null;
  final dt = DateTime.tryParse(s);
  return dt != null ? _day.format(dt) : null;
}

/// Staff profile mirroring the website: role, status, department, classes
/// taught, leave, and an Edit action.
class StaffDetailScreen extends ConsumerStatefulWidget {
  const StaffDetailScreen({super.key, required this.staffId});
  final String staffId;
  @override
  ConsumerState<StaffDetailScreen> createState() => _StaffDetailScreenState();
}

class _StaffDetailScreenState extends ConsumerState<StaffDetailScreen> {
  int _reload = 0;
  late Future<Map<String, dynamic>?> _future = _load();
  Future<Map<String, dynamic>?> _load() =>
      ref.read(apiProvider).getJson('/api/mobile/v1/admin/staff/${widget.staffId}');
  void _refresh() => setState(() { _reload++; _future = _load(); });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>?>(
      key: ValueKey(_reload),
      future: _future,
      builder: (context, snap) {
        final d = snap.data;
        final stats = (d?['stats'] as Map?)?.cast<String, dynamic>() ?? const {};
        final personal = (d?['personal'] as Map?)?.cast<String, dynamic>() ?? const {};
        final employment = (d?['employment'] as Map?)?.cast<String, dynamic>() ?? const {};
        final salary = (d?['salary'] as Map?)?.cast<String, dynamic>();
        final load = (d?['teachingLoad'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        final classTeacherOf = (d?['classTeacherOfList'] as List?)?.cast<dynamic>() ?? const [];
        final recentLeave = (d?['recentLeave'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
        return DetailScaffold(
          title: d == null ? 'Staff' : '${d['firstName']} ${d['lastName'] ?? ''}'.trim(),
          subtitle: d == null ? '' : '${d['employeeId'] ?? ''} · ${_pretty(d['staffType'] as String? ?? '')}',
          icon: Icons.badge_rounded,
          onRefresh: () async => _refresh(),
          children: [
            if (snap.connectionState == ConnectionState.waiting)
              const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
            else if (d == null)
              const AppCard(child: Text("Couldn't load this staff member.", style: TextStyle(color: AppColors.muted)))
            else ...[
              Row(children: [
                StatusChip(
                  label: _pretty(d['employmentStatus'] as String? ?? ''),
                  color: d['employmentStatus'] == 'ACTIVE' ? AppColors.good : AppColors.muted,
                  bg: d['employmentStatus'] == 'ACTIVE' ? AppColors.goodSoft : AppColors.line,
                ),
                const Spacer(),
                PrimaryButton(
                  label: 'Edit',
                  icon: Icons.edit_rounded,
                  expand: false,
                  onPressed: () async {
                    await Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => EditStaffScreen(staffId: widget.staffId)));
                    _refresh();
                  },
                ),
              ]),
              const SizedBox(height: 18),
              Row(children: [
                Expanded(child: _StatCard(label: 'Subjects taught', value: '${stats['subjectsTaught'] ?? 0}', sub: 'assignments', color: AppColors.primary)),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(label: 'Class teacher', value: '${stats['classTeacherOf'] ?? 0}', sub: 'sections', color: AppColors.teal)),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _StatCard(
                  label: 'Leave requests',
                  value: '${stats['leaveTotal'] ?? 0}',
                  sub: (stats['leavePending'] ?? 0) == 0 ? 'none pending' : '${stats['leavePending']} pending',
                  color: AppColors.gold,
                )),
                const SizedBox(width: 12),
                const Expanded(child: SizedBox()),
              ]),
              const SizedBox(height: 22),
              const SectionLabel('Details'),
              AppCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                child: Column(children: [
                  _row('Email', d['email']?.toString() ?? '—'),
                  const Hairline(),
                  _row('Phone', (d['phone']?.toString().isNotEmpty ?? false) ? d['phone'].toString() : '—'),
                  const Hairline(),
                  _row('Department', d['department']?.toString() ?? '—'),
                  const Hairline(),
                  _row('Designation', d['designation']?.toString() ?? '—'),
                ]),
              ),

              // Personal
              const SizedBox(height: 22),
              const SectionLabel('Personal'),
              AppCard(child: Column(children: [
                _kv('Date of birth', _fmtDate(personal['dateOfBirth'])),
                _kv('Blood group', personal['bloodGroup']?.toString()),
                _kv('Address', personal['address']?.toString()),
              ])),

              // Employment
              const SizedBox(height: 22),
              const SectionLabel('Employment'),
              AppCard(child: Column(children: [
                _kv('Joined', _fmtDate(employment['joiningDate'])),
                _kv('Qualification', employment['qualification']?.toString()),
                _kv('Experience', employment['experience'] != null ? '${employment['experience']} years' : null),
                _kv('Specialisation', employment['specialisation']?.toString()),
                _kv('PF number', employment['pfNumber']?.toString()),
                _kv('PAN', employment['panNumber']?.toString()),
                _kv('Last login', _fmtDate(employment['lastLoginAt'])),
              ])),

              // Salary & bank
              if (salary != null) ...[
                const SizedBox(height: 22),
                const SectionLabel('Salary & bank'),
                AppCard(child: Column(children: [
                  _kv('Basic salary', _inr.format((salary['basic'] ?? 0) as num)),
                  _kv('Structure', salary['structure']?.toString()),
                  _kv('Bank', salary['bankName']?.toString()),
                  _kv('Account', salary['bankAccount']?.toString()),
                ])),
              ],

              // Teaching load
              if (load.isNotEmpty) ...[
                const SizedBox(height: 22),
                SectionLabel('Teaching load (${load.length})'),
                AppCard(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), child: Column(children: [
                  for (int i = 0; i < load.length; i++) ...[
                    Padding(padding: const EdgeInsets.symmetric(vertical: 9), child: Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(load[i]['subject']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                        Text('${load[i]['className'] ?? ''}${load[i]['students'] != null ? ' · ${load[i]['students']} students' : ''}',
                            style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                      ])),
                      Text('${load[i]['weeklyPeriods'] ?? 0}/wk', style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                    ])),
                    if (i < load.length - 1) const Hairline(),
                  ],
                ])),
                if (classTeacherOf.isNotEmpty)
                  Padding(padding: const EdgeInsets.only(top: 8),
                      child: Wrap(spacing: 8, runSpacing: 8, children: [
                        for (final ct in classTeacherOf)
                          StatusChip(label: 'Class teacher · $ct', color: AppColors.teal, bg: AppColors.goodSoft),
                      ])),
              ],

              // Recent leave
              if (recentLeave.isNotEmpty) ...[
                const SizedBox(height: 22),
                const SectionLabel('Recent leave'),
                AppCard(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), child: Column(children: [
                  for (int i = 0; i < recentLeave.length; i++) ...[
                    Padding(padding: const EdgeInsets.symmetric(vertical: 9), child: Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(recentLeave[i]['type']?.toString() ?? 'Leave', style: const TextStyle(fontWeight: FontWeight.w600)),
                        Text('${_fmtDate(recentLeave[i]['from']) ?? ''} – ${_fmtDate(recentLeave[i]['to']) ?? ''} · ${recentLeave[i]['days'] ?? ''}d',
                            style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                      ])),
                      StatusChip(
                        label: _pretty(recentLeave[i]['status']?.toString() ?? ''),
                        color: recentLeave[i]['status'] == 'APPROVED' ? AppColors.good : recentLeave[i]['status'] == 'REJECTED' ? AppColors.danger : AppColors.warn,
                        bg: recentLeave[i]['status'] == 'APPROVED' ? AppColors.goodSoft : recentLeave[i]['status'] == 'REJECTED' ? AppColors.dangerSoft : AppColors.warnSoft,
                      ),
                    ])),
                    if (i < recentLeave.length - 1) const Hairline(),
                  ],
                ])),
              ],
            ],
          ],
        );
      },
    );
  }

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(children: [
          SizedBox(width: 120, child: Text(k, style: const TextStyle(color: AppColors.muted, fontSize: 13))),
          Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600), textAlign: TextAlign.right)),
        ]),
      );

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
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.sub, required this.color});
  final String label;
  final String value;
  final String sub;
  final Color color;
  @override
  Widget build(BuildContext context) => AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: eyebrow(AppColors.muted)),
          const SizedBox(height: 6),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 2),
          Text(sub, style: const TextStyle(fontSize: 11.5, color: AppColors.faint)),
        ]),
      );
}
