import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

const _audiences = ['ALL', 'PARENTS', 'STUDENTS', 'STAFF'];

class PostNoticeScreen extends ConsumerStatefulWidget {
  const PostNoticeScreen({super.key});
  @override
  ConsumerState<PostNoticeScreen> createState() => _PostNoticeScreenState();
}

class _PostNoticeScreenState extends ConsumerState<PostNoticeScreen> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  final _selected = <String>{'ALL'};
  bool _pinned = false;
  bool _saving = false;

  Future<void> _submit() async {
    if (_title.text.trim().length < 3 || _body.text.trim().length < 3) {
      showToast(context, 'Add a title and a message.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/notice', {
      'title': _title.text.trim(),
      'body': _body.text.trim(),
      'audience': _selected.toList(),
      'isPinned': _pinned,
      'publishNow': true,
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Published.' : 'Could not publish.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    return DetailScaffold(
      title: 'Post a notice',
      subtitle: 'Broadcast to the school',
      icon: Icons.campaign_rounded,
      children: [
        AppTextField(controller: _title, label: 'Title', hint: 'e.g. Parent–teacher meeting', required: true),
        const SizedBox(height: 16),
        AppTextField(controller: _body, label: 'Message', hint: 'Write the announcement…', maxLines: 6, required: true),
        const SizedBox(height: 20),
        Text('AUDIENCE', style: eyebrow(AppColors.muted)),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final a in _audiences)
              GestureDetector(
                onTap: () => setState(() {
                  if (a == 'ALL') {
                    _selected
                      ..clear()
                      ..add('ALL');
                  } else {
                    _selected.remove('ALL');
                    _selected.contains(a) ? _selected.remove(a) : _selected.add(a);
                    if (_selected.isEmpty) _selected.add('ALL');
                  }
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    gradient: _selected.contains(a) ? kHeroGradient : null,
                    color: _selected.contains(a) ? null : AppColors.surface,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                    boxShadow: _selected.contains(a) ? null : kCardShadow,
                  ),
                  child: Text(a[0] + a.substring(1).toLowerCase(),
                      style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: _selected.contains(a) ? Colors.white : AppColors.ink)),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        AppCard(
          child: ToggleRow(
            title: 'Pin to top',
            subtitle: 'Keep this notice above the rest',
            value: _pinned,
            onChanged: (v) => setState(() => _pinned = v),
          ),
        ),
        const SizedBox(height: 22),
        PrimaryButton(
          label: _saving ? 'Publishing…' : 'Publish notice',
          icon: Icons.send_rounded,
          onPressed: _saving ? null : _submit,
        ),
      ],
    );
  }

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }
}
