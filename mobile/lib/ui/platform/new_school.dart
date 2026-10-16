import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Provisions a whole new tenant: the school, its system roles, a current
/// academic year and a first super admin with a one-time password.
///
/// The password is shown once, on the result card — the server stores only its
/// hash, so there is no second chance to read it.
class NewSchoolScreen extends ConsumerStatefulWidget {
  const NewSchoolScreen({super.key});
  @override
  ConsumerState<NewSchoolScreen> createState() => _NewSchoolScreenState();
}

class _NewSchoolScreenState extends ConsumerState<NewSchoolScreen> {
  final _name = TextEditingController();
  final _slug = TextEditingController();
  final _code = TextEditingController();
  final _board = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _currency = TextEditingController(text: 'INR');
  final _yearName = TextEditingController();
  final _adminFirst = TextEditingController();
  final _adminLast = TextEditingController();
  final _adminEmail = TextEditingController();
  DateTime? _yearStart;
  DateTime? _yearEnd;
  bool _saving = false;
  String? _created;

  @override
  void initState() {
    super.initState();
    // A sensible default session: April this year to March next, the Indian
    // school year. Both dates stay editable.
    final now = DateTime.now();
    final startYear = now.month >= 4 ? now.year : now.year - 1;
    _yearStart = DateTime(startYear, 4, 1);
    _yearEnd = DateTime(startYear + 1, 3, 31);
    _yearName.text = '$startYear-${(startYear + 1) % 100}';
  }

  Future<void> _pick(bool start) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: (start ? _yearStart : _yearEnd) ?? now,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null) setState(() => start ? _yearStart = picked : _yearEnd = picked);
  }

  String _fmt(DateTime? d) => d == null ? 'Choose' : '${d.day}/${d.month}/${d.year}';
  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _save() async {
    if (_name.text.trim().length < 2) {
      showToast(context, 'Enter the school’s name.', error: true);
      return;
    }
    if (_adminFirst.text.trim().isEmpty || !_adminEmail.text.contains('@')) {
      showToast(context, 'Enter the first admin’s name and email.', error: true);
      return;
    }
    if (_yearStart == null || _yearEnd == null) {
      showToast(context, 'Choose the academic year’s dates.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/platform/schools', {
      'name': _name.text.trim(),
      'slug': _slug.text.trim(),
      'code': _code.text.trim(),
      'board': _board.text.trim(),
      'city': _city.text.trim(),
      'state': _state.text.trim(),
      'currency': _currency.text.trim(),
      'yearName': _yearName.text.trim(),
      'yearStart': _iso(_yearStart!),
      'yearEnd': _iso(_yearEnd!),
      'adminFirstName': _adminFirst.text.trim(),
      'adminLastName': _adminLast.text.trim(),
      'adminEmail': _adminEmail.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);

    final message = (res.body?['message'] ?? res.body?['error'] ?? 'Could not create the school.')
        .toString();
    if (res.ok && res.body?['ok'] == true) {
      ref.invalidate(platformSchoolsProvider);
      // Kept on screen rather than shown as a toast: it carries the one-time
      // password, which cannot be read again anywhere.
      setState(() => _created = message);
    } else {
      showToast(context, message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_created != null) {
      return DetailScaffold(
        title: 'School created',
        subtitle: 'Hand the password over now',
        icon: Icons.check_circle_rounded,
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(children: [
                  Icon(Icons.vpn_key_rounded, color: AppColors.good, size: 20),
                  SizedBox(width: 10),
                  Text('One-time password',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                ]),
                const SizedBox(height: 12),
                SelectableText(_created!,
                    style: const TextStyle(fontSize: 14, height: 1.5)),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'This is the only time the password is shown — the server keeps only its '
            'hash. The admin must change it at first sign-in.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.5),
          ),
          const SizedBox(height: 22),
          PrimaryButton(
            label: 'Back to schools',
            icon: Icons.arrow_back_rounded,
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ],
      );
    }

    return DetailScaffold(
      title: 'New school',
      subtitle: 'Provision a tenant',
      icon: Icons.add_business_rounded,
      children: [
        const SectionLabel('School'),
        AppTextField(controller: _name, label: 'Name', required: true),
        const SizedBox(height: 12),
        AppTextField(controller: _slug, label: 'URL slug (optional — made from the name)'),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: AppTextField(controller: _code, label: 'Code')),
          const SizedBox(width: 12),
          Expanded(child: AppTextField(controller: _board, label: 'Board')),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: AppTextField(controller: _city, label: 'City')),
          const SizedBox(width: 12),
          Expanded(child: AppTextField(controller: _state, label: 'State')),
        ]),
        const SizedBox(height: 12),
        AppTextField(controller: _currency, label: 'Currency'),
        const SizedBox(height: 20),
        const SectionLabel('First academic year'),
        AppTextField(controller: _yearName, label: 'Name (e.g. 2026-27)', required: true),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: _DateField(label: 'Starts', value: _fmt(_yearStart), onTap: () => _pick(true))),
          const SizedBox(width: 12),
          Expanded(child: _DateField(label: 'Ends', value: _fmt(_yearEnd), onTap: () => _pick(false))),
        ]),
        const SizedBox(height: 20),
        const SectionLabel('First super admin'),
        Row(children: [
          Expanded(child: AppTextField(controller: _adminFirst, label: 'First name', required: true)),
          const SizedBox(width: 12),
          Expanded(child: AppTextField(controller: _adminLast, label: 'Last name')),
        ]),
        const SizedBox(height: 12),
        AppTextField(
            controller: _adminEmail,
            label: 'Email',
            required: true,
            keyboard: TextInputType.emailAddress),
        const SizedBox(height: 22),
        PrimaryButton(
          label: _saving ? 'Creating…' : 'Create school',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _save,
        ),
      ],
    );
  }

  @override
  void dispose() {
    for (final c in [
      _name, _slug, _code, _board, _city, _state, _currency,
      _yearName, _adminFirst, _adminLast, _adminEmail,
    ]) {
      c.dispose();
    }
    super.dispose();
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: eyebrow(AppColors.muted)),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
            decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                boxShadow: kCardShadow),
            child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ]),
      );
}
