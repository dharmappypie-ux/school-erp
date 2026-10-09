import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _apiDate = DateFormat('yyyy-MM-dd');
final _showDate = DateFormat('d MMM yyyy');

/// Copied from the web form (src/app/(app)/careers/job-form.tsx). The API takes
/// any string up to 60 chars, so the two lists only stay in step by hand.
const _categories = [
  'Teaching — PRT',
  'Teaching — TGT',
  'Teaching — PGT',
  'Head of Department',
  'Administration',
  'Accounts',
  'Front Office',
  'Librarian',
  'Lab Assistant',
  'Transport',
  'Housekeeping',
  'Security',
  'Other',
];

({Color c, Color bg, String label}) _statusStyle(String s) => switch (s) {
      'DRAFT' => (c: AppColors.warn, bg: AppColors.warnSoft, label: 'Draft'),
      'OPEN' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Open'),
      'FILLED' => (c: AppColors.teal, bg: AppColors.tealSoft, label: 'Filled'),
      _ => (c: AppColors.muted, bg: AppColors.line, label: 'Closed'),
    };

/// `closingDate` is a date, not an instant: the server stores the chosen day at
/// UTC end-of-day. Converting it to local time rolls it onto the next calendar
/// day everywhere east of UTC — an admin in IST picking 10 Nov would read back
/// "closes 11 Nov" — so it is formatted in the zone it was stored in, matching
/// `_dateOnly` in admin_behaviour.dart.
String? _onDate(Object? iso) {
  final at = DateTime.tryParse(iso?.toString() ?? '');
  return at == null ? null : _showDate.format(at);
}

/// The job board: postings with their application counts, and — for anyone
/// holding careers.manage — the form that advertises a new vacancy.
class AdminCareersScreen extends ConsumerWidget {
  const AdminCareersScreen({super.key});

  void _newPosting(BuildContext context) => showModalBottomSheet(
        context: context,
        backgroundColor: Colors.transparent,
        // The form is long enough to fill the screen, so it needs the full
        // height and must keep clear of the notch.
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => const _PostingSheet(),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(careersListProvider);
    final items =
        (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final offline = !async.isLoading && async.value == null;
    final counts =
        (async.value?['counts'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    int n(String key) => (counts[key] as num?)?.toInt() ?? 0;
    // The top-level flag, not a row's: with nothing advertised yet there is no
    // row to read it from, and that is exactly when the form is wanted.
    final canManage = async.value?['canManage'] == true;

    return DetailScaffold(
      title: 'Careers',
      subtitle: async.value == null
          ? (offline ? 'Not loaded' : 'Loading…')
          : '${n('open')} open · ${n('applications')} applications',
      icon: Icons.work_outline_rounded,
      onRefresh: () async => ref.invalidate(careersListProvider),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(
              child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn),
            SizedBox(width: 12),
            Expanded(
                child: Text("Couldn't reach the school — pull down to retry.",
                    style: TextStyle(color: AppColors.muted))),
          ]))
        else ...[
          AppCard(
            child: Row(children: [
              _Count(value: n('open'), label: 'Open', color: AppColors.good),
              _Count(
                  value: n('applications'),
                  label: 'Applications',
                  color: AppColors.primary),
              _Count(value: n('lapsed'), label: 'Past closing', color: AppColors.danger),
              // Drafts are never sent to a read-only caller, so the tile would
              // always read zero for them.
              if (canManage)
                _Count(value: n('drafts'), label: 'Drafts', color: AppColors.warn),
            ]),
          ),
          const SizedBox(height: 16),
          if (canManage) ...[
            PrimaryButton(
              label: 'New posting',
              icon: Icons.post_add_rounded,
              onPressed: () => _newPosting(context),
            ),
            const SizedBox(height: 16),
          ],
          if (items.isEmpty)
            const AppCard(
                child: Row(children: [
              Icon(Icons.work_off_rounded, color: AppColors.faint),
              SizedBox(width: 12),
              Expanded(
                  child: Text('Nothing advertised yet.',
                      style: TextStyle(color: AppColors.muted))),
            ]))
          else
            for (final r in items) ...[
              _PostingCard(r: r),
              const SizedBox(height: 12),
            ],
        ],
      ],
    );
  }
}

class _Count extends StatelessWidget {
  const _Count({required this.value, required this.label, required this.color});
  final int value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$value',
                style: TextStyle(
                    fontSize: 21, fontWeight: FontWeight.w800, height: 1, color: color)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
          ],
        ),
      );
}

class _PostingCard extends ConsumerStatefulWidget {
  const _PostingCard({required this.r});
  final Map<String, dynamic> r;
  @override
  ConsumerState<_PostingCard> createState() => _PostingCardState();
}

class _PostingCardState extends ConsumerState<_PostingCard> {
  /// The status being written, not a plain bool: an OPEN posting shows both
  /// "Filled" and "Close", and one shared flag spins them together so the admin
  /// cannot tell which change is in flight.
  String? _pending;

  Future<void> _setStatus(String status) async {
    setState(() => _pending = status);
    final res = await ref
        .read(apiProvider)
        .postJson('/api/mobile/v1/admin/careers/status', {
      'id': widget.r['id'],
      'status': status,
    });
    if (!mounted) return;
    setState(() => _pending = null);
    final msg = res.body?['message'] ??
        res.body?['error'] ??
        (res.ok ? 'Updated.' : 'Could not update the posting.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(careersListProvider);
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.r;
    final status = (r['status'] as String?) ?? 'DRAFT';
    final st = _statusStyle(status);
    final vacancies = (r['vacancies'] as num?)?.toInt() ?? 1;
    final experience = (r['minExperience'] as num?)?.toInt();
    final applications = (r['applications'] as num?)?.toInt() ?? 0;
    final closes = _onDate(r['closingDate']);
    final location = r['location']?.toString() ?? '';

    final meta = <String>[
      vacancies == 1 ? '1 vacancy' : '$vacancies vacancies',
      experience == null ? 'freshers may apply' : '$experience+ yrs',
      if ((r['qualification']?.toString() ?? '').isNotEmpty) r['qualification'].toString(),
      if ((r['salaryRange']?.toString() ?? '').isNotEmpty) r['salaryRange'].toString(),
      if (closes != null) 'closes $closes',
      applications == 1 ? '1 application' : '$applications applications',
    ];

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(r['title']?.toString() ?? '',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 8),
              StatusChip(label: st.label, color: st.c, bg: st.bg),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              StatusChip(
                  label: r['category']?.toString() ?? '',
                  color: AppColors.primary,
                  bg: AppColors.accentSoft),
              if (location.isNotEmpty)
                StatusChip(
                    label: location,
                    color: AppColors.muted,
                    bg: AppColors.surfaceSunken,
                    icon: Icons.place_rounded),
              if (r['lapsed'] == true)
                StatusChip(
                    label: 'Past closing date',
                    color: AppColors.danger,
                    bg: AppColors.dangerSoft),
            ],
          ),
          if ((r['description']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(r['description'].toString(),
                style: const TextStyle(fontSize: 13, height: 1.4)),
          ],
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(children: [
              // Applicants quote the reference over the phone, so it is set
              // apart from the prose around it.
              TextSpan(
                  text: r['reference']?.toString() ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 0.6)),
              TextSpan(text: ' · ${meta.join(' · ')}'),
            ]),
            style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.4),
          ),
          if (r['canManage'] == true) ...[
            const SizedBox(height: 14),
            Row(children: [
              if (status == 'DRAFT')
                Expanded(
                  child: _Btn(
                      label: 'Publish',
                      color: AppColors.good,
                      filled: true,
                      busy: _pending == 'OPEN',
                      onTap: _pending != null ? null : () => _setStatus('OPEN')),
                )
              else if (status == 'OPEN') ...[
                Expanded(
                  child: _Btn(
                      label: 'Filled',
                      color: AppColors.teal,
                      filled: false,
                      busy: _pending == 'FILLED',
                      onTap: _pending != null ? null : () => _setStatus('FILLED')),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Btn(
                      label: 'Close',
                      color: AppColors.muted,
                      filled: false,
                      busy: _pending == 'CLOSED',
                      onTap: _pending != null ? null : () => _setStatus('CLOSED')),
                ),
              ] else
                Expanded(
                  child: _Btn(
                      label: 'Reopen',
                      color: AppColors.good,
                      filled: false,
                      busy: _pending == 'OPEN',
                      onTap: _pending != null ? null : () => _setStatus('OPEN')),
                ),
            ]),
          ],
        ],
      ),
    );
  }
}

class _PostingSheet extends ConsumerStatefulWidget {
  const _PostingSheet();
  @override
  ConsumerState<_PostingSheet> createState() => _PostingSheetState();
}

class _PostingSheetState extends ConsumerState<_PostingSheet> {
  final _title = TextEditingController();
  final _vacancies = TextEditingController(text: '1');
  final _experience = TextEditingController();
  final _qualification = TextEditingController();
  final _description = TextEditingController();
  final _responsibilities = TextEditingController();
  final _location = TextEditingController();
  final _salary = TextEditingController();
  String? _category;
  DateTime? _closing;
  bool _cvRequired = true;
  bool _busy = false;
  bool _publishing = false;

  @override
  void dispose() {
    _title.dispose();
    _vacancies.dispose();
    _experience.dispose();
    _qualification.dispose();
    _description.dispose();
    _responsibilities.dispose();
    _location.dispose();
    _salary.dispose();
    super.dispose();
  }

  Future<void> _pickClosing() async {
    // Date-only, because a picked date equal to today would otherwise sit
    // before a firstDate carrying the current time and trip the picker.
    final today = DateUtils.dateOnly(DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: _closing ?? today.add(const Duration(days: 30)),
      // A post that has already closed cannot be published, so don't offer one.
      firstDate: today,
      lastDate: today.add(const Duration(days: 730)),
    );
    if (picked == null || !mounted) return;
    setState(() => _closing = picked);
  }

  Future<void> _submit({required bool publishNow}) async {
    if (_title.text.trim().isEmpty) {
      showToast(context, 'Give the post a title.', error: true);
      return;
    }
    if (_category == null) {
      showToast(context, 'Choose a category.', error: true);
      return;
    }
    // The server coerces these, but a typo would come back as a coercion
    // message rather than something a head of school can act on.
    final vacanciesText = _vacancies.text.trim();
    final vacancies = vacanciesText.isEmpty ? null : int.tryParse(vacanciesText);
    if (vacanciesText.isNotEmpty && (vacancies == null || vacancies < 1)) {
      showToast(context, 'Vacancies must be a whole number, one or more.', error: true);
      return;
    }
    final experienceText = _experience.text.trim();
    final experience = experienceText.isEmpty ? null : int.tryParse(experienceText);
    if (experienceText.isNotEmpty && (experience == null || experience < 0)) {
      showToast(context, 'Experience must be a whole number of years, or blank.',
          error: true);
      return;
    }

    setState(() {
      _busy = true;
      _publishing = publishNow;
    });
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/careers', {
      'title': _title.text.trim(),
      'category': _category,
      'description': _description.text.trim(),
      'responsibilities': _responsibilities.text.trim(),
      'location': _location.text.trim(),
      'qualification': _qualification.text.trim(),
      'salaryRange': _salary.text.trim(),
      'minExperience': experience,
      'vacancies': vacancies,
      'cvRequired': _cvRequired,
      // A bare date: the server closes applications at the end of it, in UTC.
      'closingDate': _closing == null ? null : _apiDate.format(_closing!),
      'publishNow': publishNow,
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ??
        res.body?['error'] ??
        (res.ok ? 'Saved.' : 'Could not save the posting.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(careersListProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        margin: const EdgeInsets.all(14),
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
        decoration: BoxDecoration(
          // The page ground rather than white: the fields are white cards and
          // would otherwise vanish into the sheet.
          color: AppColors.bg,
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('NEW POSTING', style: eyebrow(AppColors.primary)),
            const SizedBox(height: 6),
            const Text('Advertise a vacancy',
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppTextField(
                        controller: _title,
                        label: 'Post title',
                        hint: 'PGT Mathematics',
                        required: true),
                    const SizedBox(height: 14),
                    AppDropdown<String>(
                      label: 'Category',
                      value: _category,
                      items: _categories,
                      itemLabel: (c) => c,
                      required: true,
                      onChanged: (c) => setState(() => _category = c),
                    ),
                    const SizedBox(height: 14),
                    Row(children: [
                      Expanded(
                          child: AppTextField(
                              controller: _vacancies,
                              label: 'Vacancies',
                              keyboard: TextInputType.number)),
                      const SizedBox(width: 12),
                      Expanded(
                          child: AppTextField(
                              controller: _experience,
                              label: 'Min. experience',
                              hint: 'Years — blank for freshers',
                              keyboard: TextInputType.number)),
                    ]),
                    const SizedBox(height: 14),
                    AppTextField(
                        controller: _qualification,
                        label: 'Qualification',
                        hint: 'M.Sc. Mathematics with B.Ed.'),
                    const SizedBox(height: 14),
                    AppTextField(
                        controller: _description,
                        label: 'Description',
                        hint: 'What the role covers',
                        maxLines: 3),
                    const SizedBox(height: 14),
                    AppTextField(
                        controller: _responsibilities,
                        label: 'Responsibilities',
                        hint: 'Day to day duties',
                        maxLines: 3),
                    const SizedBox(height: 14),
                    AppTextField(
                        controller: _location, label: 'Location', hint: 'Main campus'),
                    const SizedBox(height: 14),
                    AppTextField(
                        controller: _salary,
                        label: 'Salary range',
                        hint: '45,000 - 60,000 / month'),
                    const SizedBox(height: 14),
                    _ClosingField(value: _closing, onTap: _pickClosing),
                    const SizedBox(height: 6),
                    ToggleRow(
                      title: 'Require a CV',
                      subtitle: 'Applicants must attach one to apply',
                      value: _cvRequired,
                      onChanged: (v) => setState(() => _cvRequired = v),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: _Btn(
                    label: 'Save as draft',
                    color: AppColors.muted,
                    filled: false,
                    busy: _busy && !_publishing,
                    onTap: _busy ? null : () => _submit(publishNow: false)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Btn(
                    label: 'Publish',
                    color: AppColors.primary,
                    filled: true,
                    busy: _busy && _publishing,
                    onTap: _busy ? null : () => _submit(publishNow: true)),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}

class _ClosingField extends StatelessWidget {
  const _ClosingField({required this.value, required this.onTap});
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4),
          child: Text('CLOSING DATE', style: eyebrow(AppColors.muted)),
        ),
        const SizedBox(height: 7),
        GestureDetector(
          onTap: onTap,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              boxShadow: kCardShadow,
            ),
            child: Row(children: [
              Expanded(
                child: Text(
                    value == null
                        ? 'No closing date'
                        : 'Applications close ${_showDate.format(value!)}',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: value == null ? FontWeight.w500 : FontWeight.w600,
                        color: value == null ? AppColors.faint : AppColors.ink)),
              ),
              const Icon(Icons.event_rounded, size: 19, color: AppColors.muted),
            ]),
          ),
        ),
      ],
    );
  }
}

class _Btn extends StatelessWidget {
  const _Btn(
      {required this.label,
      required this.color,
      required this.filled,
      required this.busy,
      this.onTap});
  final String label;
  final Color color;
  final bool filled;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled ? color : color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: filled ? null : Border.all(color: color.withValues(alpha: 0.5)),
        ),
        child: busy
            ? SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: filled ? Colors.white : color))
            : Text(label,
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13.5,
                    color: filled ? Colors.white : color)),
      ),
    );
  }
}
