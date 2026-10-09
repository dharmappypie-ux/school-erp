import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

final _apiDate = DateFormat('yyyy-MM-dd');
final _showDate = DateFormat('d MMM yyyy');

/// The roll runs to hundreds and the students endpoint pages at 30, so the
/// search goes to the server rather than filtering one page locally. The key is
/// the *first* word only: the server ORs `contains` over firstName and lastName
/// separately, so "Aadhya Patel" as one string matches neither — the rest of
/// the words narrow the returned page on the client instead.
final _rollSearchProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>?, String>((ref, firstWord) {
  return ref.watch(apiProvider).getJson('/api/mobile/v1/admin/students',
      query: {'q': firstWord, 'status': 'ACTIVE'});
});

const _kinds = [
  ('APPRECIATION', 'Appreciation — something done well'),
  ('CONCERN', 'Concern — something to address'),
  ('NEUTRAL', 'Neutral — a record of what happened'),
];

const _severities = [
  ('LOW', 'Low — mention it'),
  ('MEDIUM', 'Medium — tell the guardian'),
  ('HIGH', 'High — needs a meeting'),
];

/// Sentinel for the free-text escape hatch; never sent to the server.
const _otherCategory = '__other__';

const _categories = [
  'Discipline',
  'Homework',
  'Punctuality',
  'Uniform',
  'Helpfulness',
  'Academic effort',
  'Sport',
  'Peer conflict',
];

({Color c, Color bg, String label}) _kindStyle(String kind, {required bool retracted}) {
  // A retracted note is withdrawn, so its kind stops shouting — the same
  // neutral treatment the web page gives it.
  if (retracted) return (c: AppColors.muted, bg: AppColors.line, label: _kindLabel(kind));
  return switch (kind) {
    'APPRECIATION' => (c: AppColors.good, bg: AppColors.goodSoft, label: 'Appreciation'),
    'CONCERN' => (c: AppColors.danger, bg: AppColors.dangerSoft, label: 'Concern'),
    _ => (c: AppColors.muted, bg: AppColors.line, label: 'Note'),
  };
}

String _kindLabel(String kind) => switch (kind) {
      'APPRECIATION' => 'Appreciation',
      'CONCERN' => 'Concern',
      _ => 'Note',
    };

/// `occurredOn` is a date, stored as UTC midnight. Converting it to local time
/// first would render it a day early for anyone west of UTC, so it is formatted
/// in the zone it was stored in.
String _dateOnly(Object? iso) {
  final parsed = DateTime.tryParse(iso?.toString() ?? '');
  return parsed == null ? '' : _showDate.format(parsed);
}

/// Behaviour ledger: appreciation and concern alike, newest first, with the
/// form to record a note on top. Retracted notes stay on the list, struck
/// through — the record is meant to be honest, not tidy.
class AdminBehaviourScreen extends ConsumerWidget {
  const AdminBehaviourScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(behaviourListProvider);
    final items =
        (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final counts = (async.value?['counts'] as Map?)?.cast<String, dynamic>() ?? const {};
    final offline = !async.isLoading && async.value == null;
    final waiting = (counts['awaitingGuardian'] as num?)?.toInt() ?? 0;

    return DetailScaffold(
      title: 'Behaviour',
      subtitle: offline
          ? 'Not loaded'
          : waiting > 0
              ? '$waiting guardian${waiting == 1 ? '' : 's'} still to be told'
              : 'Last 100 notes',
      icon: Icons.emoji_people_rounded,
      onRefresh: () async => ref.invalidate(behaviourListProvider),
      children: [
        if (!offline && async.value != null) ...[
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 16),
            child: Row(
              children: [
                _Count(
                    value: counts['appreciations'],
                    label: 'Appreciations',
                    color: AppColors.good),
                const _CountDivider(),
                _Count(
                    value: counts['concerns'], label: 'Concerns', color: AppColors.danger),
                const _CountDivider(),
                _Count(
                    value: waiting,
                    label: 'Guardian not told',
                    color: waiting > 0 ? AppColors.warn : AppColors.muted),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        const _RecordCard(),
        const SizedBox(height: 16),
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
        else if (items.isEmpty)
          const AppCard(
              child: Row(children: [
            Icon(Icons.inbox_rounded, color: AppColors.faint),
            SizedBox(width: 12),
            Expanded(
                child: Text('No behaviour notes yet.',
                    style: TextStyle(color: AppColors.muted))),
          ]))
        else
          for (final r in items) ...[
            _NoteCard(r: r),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _Count extends StatelessWidget {
  const _Count({required this.value, required this.label, required this.color});
  final Object? value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          children: [
            Text('${(value as num?)?.toInt() ?? 0}',
                style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    height: 1,
                    letterSpacing: -0.5,
                    color: color)),
            const SizedBox(height: 6),
            Text(label,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
          ],
        ),
      );
}

class _CountDivider extends StatelessWidget {
  const _CountDivider();
  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 34, color: AppColors.line);
}

// ---- the ledger ----------------------------------------------------------

class _NoteCard extends ConsumerStatefulWidget {
  const _NoteCard({required this.r});
  final Map<String, dynamic> r;
  @override
  ConsumerState<_NoteCard> createState() => _NoteCardState();
}

class _NoteCardState extends ConsumerState<_NoteCard> {
  bool _busy = false;

  Future<void> _post(String path, String fallback) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson(path, {'id': widget.r['id']});
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? fallback;
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) ref.invalidate(behaviourListProvider);
  }

  Future<void> _retract() async {
    // Retracting cannot be undone — the row is flagged for good — so it asks
    // first, unlike "Guardian told".
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Retract this note?'),
        content: Text(
            'It stays on the ledger, struck through, and can never be unretracted. '
            '${widget.r['studentName'] ?? 'The student'}\'s record will show it was withdrawn.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false), child: const Text('Keep it')),
          TextButton(
              onPressed: () => Navigator.pop(context, true), child: const Text('Retract')),
        ],
      ),
    );
    if (ok != true) return;
    await _post('/api/mobile/v1/admin/behaviour/retract', 'Could not retract the note.');
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.r;
    final retracted = r['retracted'] == true;
    final kind = r['kind']?.toString() ?? 'NEUTRAL';
    final st = _kindStyle(kind, retracted: retracted);
    final severity = r['severity']?.toString() ?? 'LOW';
    final category = r['category']?.toString() ?? '';
    // Empty string, not null, when the student has no active enrollment.
    final className = r['className']?.toString() ?? '';
    final notified = r['guardianNotified'] == true;
    final canAct = r['canAct'] == true;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r['studentName']?.toString() ?? '',
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: retracted ? AppColors.muted : AppColors.ink)),
                    const SizedBox(height: 2),
                    Text(
                        [
                          if (className.isNotEmpty) className,
                          r['admissionNo']?.toString() ?? '',
                        ].where((v) => v.isNotEmpty).join(' · '),
                        style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                  ],
                ),
              ),
              StatusChip(label: st.label, color: st.c, bg: st.bg),
            ],
          ),
          if (retracted || category.isNotEmpty || (kind == 'CONCERN' && severity != 'LOW')) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                // Severity is forced to LOW on anything but a concern, so it
                // only means something — and only shows — on a concern.
                if (kind == 'CONCERN' && severity != 'LOW')
                  StatusChip(
                      label: severity == 'HIGH' ? 'High' : 'Medium',
                      color: severity == 'HIGH' ? AppColors.danger : AppColors.warn,
                      bg: severity == 'HIGH' ? AppColors.dangerSoft : AppColors.warnSoft),
                if (category.isNotEmpty)
                  StatusChip(label: category, color: AppColors.teal, bg: AppColors.tealSoft),
                if (retracted)
                  const StatusChip(
                      label: 'Retracted', color: AppColors.muted, bg: AppColors.line),
              ],
            ),
          ],
          const SizedBox(height: 8),
          Text(r['summary']?.toString() ?? '',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: retracted ? AppColors.muted : AppColors.ink,
                decoration: retracted ? TextDecoration.lineThrough : null,
                decorationColor: AppColors.muted,
              )),
          if ((r['detail']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(r['detail'].toString(),
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.4,
                  color: retracted ? AppColors.faint : AppColors.muted,
                )),
          ],
          const SizedBox(height: 8),
          Text(
              [
                _dateOnly(r['occurredOn']),
                r['recordedBy']?.toString() ?? '',
                if (notified) 'guardian told ${_notifiedOn(r['guardianNotifiedAt'])}',
              ].where((v) => v.isNotEmpty).join(' · '),
              style: const TextStyle(fontSize: 11.5, color: AppColors.faint)),
          if (canAct) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                if (!notified) ...[
                  Expanded(
                    child: _Btn(
                      label: 'Guardian told',
                      color: AppColors.good,
                      filled: true,
                      busy: _busy,
                      onTap: _busy
                          ? null
                          : () => _post('/api/mobile/v1/admin/behaviour/notified',
                              'Could not mark the guardian as told.'),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: _Btn(
                    label: 'Retract',
                    color: AppColors.danger,
                    filled: false,
                    busy: _busy && notified,
                    onTap: _busy ? null : _retract,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Unlike `occurredOn`, this one is a real instant, so it belongs in the
/// reader's own time zone.
String _notifiedOn(Object? iso) {
  final parsed = DateTime.tryParse(iso?.toString() ?? '');
  return parsed == null ? '' : _showDate.format(parsed.toLocal());
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
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(label,
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13.5,
                    color: filled ? Colors.white : color)),
      ),
    );
  }
}

// ---- recording a note ----------------------------------------------------

class _RecordCard extends StatelessWidget {
  const _RecordCard();

  @override
  Widget build(BuildContext context) => const AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Record note',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            SizedBox(height: 2),
            Text('Praise counts as much as a concern.',
                style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
            SizedBox(height: 14),
            _RecordForm(),
          ],
        ),
      );
}

class _RecordForm extends ConsumerStatefulWidget {
  const _RecordForm();
  @override
  ConsumerState<_RecordForm> createState() => _RecordFormState();
}

class _RecordFormState extends ConsumerState<_RecordForm> {
  Map<String, dynamic>? _student;
  String _kind = 'APPRECIATION';
  String _severity = 'LOW';
  String _category = '';
  DateTime _on = DateTime.now();
  final _otherName = TextEditingController();
  final _summary = TextEditingController();
  final _detail = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _otherName.dispose();
    _summary.dispose();
    _detail.dispose();
    super.dispose();
  }

  String get _categoryValue =>
      _category == _otherCategory ? _otherName.text.trim() : _category;

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _on,
      firstDate: now.subtract(const Duration(days: 365)),
      // The server refuses a future date outright, so it is never offered.
      lastDate: now,
    );
    if (picked == null) return;
    setState(() => _on = picked);
  }

  Future<void> _submit() async {
    if (_student == null) {
      showToast(context, 'Pick the student first.', error: true);
      return;
    }
    final summary = _summary.text.trim();
    if (summary.isEmpty) {
      showToast(context, 'Write a one-line summary.', error: true);
      return;
    }
    // zod caps these server-side, but its default complaint is machine-speak;
    // catching the length here keeps the message in the school's own words.
    final detail = _detail.text.trim();
    final category = _categoryValue;
    final tooLong = summary.length > 200
        ? 'Keep the summary to one line — 200 characters is the limit.'
        : detail.length > 2000
            ? 'That detail is too long — 2000 characters is the limit.'
            : category.length > 60
                ? 'That category name is too long — 60 characters is the limit.'
                : null;
    if (tooLong != null) {
      showToast(context, tooLong, error: true);
      return;
    }

    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/behaviour', {
      'studentId': _student!['id'],
      'kind': _kind,
      // Severity is ignored on anything but a concern, so it is not sent —
      // the school-wide high-severity count only means something that way.
      if (_kind == 'CONCERN') 'severity': _severity,
      if (category.isNotEmpty) 'category': category,
      'summary': summary,
      if (detail.isNotEmpty) 'detail': detail,
      'occurredOn': _apiDate.format(_on),
    });
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = res.body?['message'] ??
        res.body?['error'] ??
        (res.ok ? 'Note recorded.' : 'Could not record the note.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      setState(() {
        _student = null;
        _kind = 'APPRECIATION';
        _severity = 'LOW';
        _category = '';
        _on = DateTime.now();
        _otherName.clear();
        _summary.clear();
        _detail.clear();
      });
      ref.invalidate(behaviourListProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StudentPicker(
          student: _student,
          onPicked: (s) => setState(() => _student = s),
        ),
        const SizedBox(height: 14),
        AppDropdown<String>(
          label: 'Kind',
          required: true,
          value: _kind,
          items: [for (final (code, _) in _kinds) code],
          itemLabel: (code) => _kinds.firstWhere((k) => k.$1 == code).$2,
          onChanged: (v) => setState(() => _kind = v ?? 'APPRECIATION'),
        ),
        if (_kind == 'CONCERN') ...[
          const SizedBox(height: 14),
          AppDropdown<String>(
            label: 'Severity',
            value: _severity,
            items: [for (final (code, _) in _severities) code],
            itemLabel: (code) => _severities.firstWhere((s) => s.$1 == code).$2,
            onChanged: (v) => setState(() => _severity = v ?? 'LOW'),
          ),
        ],
        const SizedBox(height: 14),
        AppDropdown<String>(
          label: 'Category',
          value: _category,
          items: ['', ..._categories, _otherCategory],
          itemLabel: (c) => switch (c) {
            '' => 'No category',
            _otherCategory => 'Other…',
            _ => c,
          },
          onChanged: (v) => setState(() => _category = v ?? ''),
        ),
        if (_category == _otherCategory) ...[
          const SizedBox(height: 14),
          AppTextField(
              controller: _otherName,
              label: 'Category name',
              hint: 'Name it as your school does'),
        ],
        const SizedBox(height: 14),
        AppTextField(
            controller: _summary,
            label: 'Summary',
            hint: 'Helped a new classmate settle in',
            required: true),
        const SizedBox(height: 14),
        AppTextField(
            controller: _detail,
            label: 'Detail',
            hint: 'Anything the guardian or next teacher should know.',
            maxLines: 3),
        const SizedBox(height: 14),
        _DateField(label: 'When did this happen?', value: _on, onTap: _pickDate),
        const SizedBox(height: 20),
        PrimaryButton(
            label: _busy ? 'Saving…' : 'Record note',
            icon: Icons.check_rounded,
            onPressed: _busy ? null : _submit),
      ],
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surfaceSunken,
          borderRadius: BorderRadius.circular(AppRadius.chip),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                  const SizedBox(height: 2),
                  Text(_showDate.format(value),
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
                ],
              ),
            ),
            const Icon(Icons.event_rounded, size: 20, color: AppColors.muted),
          ],
        ),
      ),
    );
  }
}

/// Searchable roll picker. Four girls can share a name — two of them in the
/// same section — so every result carries its admission number and class, and
/// the chosen one keeps showing both.
class _StudentPicker extends ConsumerStatefulWidget {
  const _StudentPicker({required this.student, required this.onPicked});
  final Map<String, dynamic>? student;
  final ValueChanged<Map<String, dynamic>?> onPicked;
  @override
  ConsumerState<_StudentPicker> createState() => _StudentPickerState();
}

class _StudentPickerState extends ConsumerState<_StudentPicker> {
  final _search = TextEditingController();
  Timer? _debounce;
  List<String> _words = const [];

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onTyped(String raw) {
    // One request per pause, not per keystroke.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 280), () {
      if (!mounted) return;
      setState(() => _words = raw
          .toLowerCase()
          .split(RegExp(r'\s+'))
          .where((w) => w.isNotEmpty)
          .toList());
    });
  }

  @override
  Widget build(BuildContext context) {
    final chosen = widget.student;
    if (chosen != null) {
      return Container(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        decoration: BoxDecoration(
          color: AppColors.accentSoft,
          borderRadius: BorderRadius.circular(AppRadius.chip),
        ),
        child: Row(
          children: [
            const Icon(Icons.check_circle_rounded, size: 20, color: AppColors.primary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(chosen['name']?.toString() ?? '',
                      style:
                          const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                  Text(
                      [
                        chosen['admissionNo']?.toString() ?? '',
                        chosen['className']?.toString() ?? '',
                      ].where((v) => v.isNotEmpty && v != '—').join(' · '),
                      style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ],
              ),
            ),
            TextButton(
                onPressed: () {
                  _search.clear();
                  setState(() => _words = const []);
                  widget.onPicked(null);
                },
                child: const Text('Change')),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppTextField(
          controller: _search,
          label: 'Student',
          hint: 'Name, admission no or class',
          required: true,
          onChanged: _onTyped,
        ),
        if (_words.isEmpty || _words.first.length < 2)
          const Padding(
            padding: EdgeInsets.only(top: 8, left: 4),
            child: Text('Type at least two letters to search the roll.',
                style: TextStyle(fontSize: 12, color: AppColors.faint)),
          )
        else
          _Results(words: _words, onPicked: widget.onPicked),
      ],
    );
  }
}

class _Results extends ConsumerWidget {
  const _Results({required this.words, required this.onPicked});
  final List<String> words;
  final ValueChanged<Map<String, dynamic>> onPicked;

  static const _shown = 8;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_rollSearchProvider(words.first));
    if (async.isLoading) {
      return const Padding(
        padding: EdgeInsets.only(top: 12),
        child: Center(child: SizedBox(
            width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
      );
    }
    if (async.value == null) {
      return const Padding(
        padding: EdgeInsets.only(top: 8, left: 4),
        child: Text("Couldn't search the roll — check your connection.",
            style: TextStyle(fontSize: 12, color: AppColors.warn)),
      );
    }

    final page =
        (async.value?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    // The server matched the first word; the rest narrow what came back, and
    // they can name a class too — which the endpoint cannot search on.
    final rest = words.skip(1);
    final matches = page.where((s) {
      final hay = '${s['name']} ${s['admissionNo']} ${s['className']}'.toLowerCase();
      return rest.every(hay.contains);
    }).toList();

    if (matches.isEmpty) {
      return const Padding(
        padding: EdgeInsets.only(top: 8, left: 4),
        child: Text('Nobody on the roll matches that.',
            style: TextStyle(fontSize: 12, color: AppColors.faint)),
      );
    }

    final extra = matches.length - _shown;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final s in matches.take(_shown))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: GestureDetector(
              onTap: () => onPicked(s),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSunken,
                  borderRadius: BorderRadius.circular(AppRadius.chip),
                  border: Border.all(color: AppColors.line),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s['name']?.toString() ?? '',
                              style: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 1),
                          Text(
                              [
                                s['admissionNo']?.toString() ?? '',
                                s['className']?.toString() ?? '',
                              ].where((v) => v.isNotEmpty && v != '—').join(' · '),
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.muted)),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
                  ],
                ),
              ),
            ),
          ),
        if (extra > 0 || (async.value?['hasMore'] == true))
          Padding(
            padding: const EdgeInsets.only(top: 8, left: 4),
            child: Text(
                extra > 0
                    ? '…and $extra more — add the class or admission no to narrow it.'
                    : 'More students match — add the class or admission no to narrow it.',
                style: const TextStyle(fontSize: 12, color: AppColors.faint)),
          ),
      ],
    );
  }
}
