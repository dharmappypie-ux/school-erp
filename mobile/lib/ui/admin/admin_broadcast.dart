import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

const _audiences = {
  'ALL_PARENTS': 'All parents',
  'ALL_STUDENTS': 'All students',
  'ALL_STAFF': 'All staff',
  'TEACHING_STAFF': 'Teaching staff',
  'SECTION_PARENTS': 'Parents of one class',
  'FEE_DEFAULTERS': 'Fee defaulters',
};
const _channels = ['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP'];

/// Compose and send a broadcast to an audience on a channel.
class BroadcastScreen extends ConsumerStatefulWidget {
  const BroadcastScreen({super.key});
  @override
  ConsumerState<BroadcastScreen> createState() => _BroadcastScreenState();
}

class _BroadcastScreenState extends ConsumerState<BroadcastScreen> {
  String _audience = 'ALL_PARENTS';
  String _channel = 'IN_APP';
  String? _sectionId;
  final _subject = TextEditingController();
  final _body = TextEditingController();
  bool _sending = false;

  Future<void> _send() async {
    if (_body.text.trim().isEmpty) {
      showToast(context, 'Write a message.', error: true);
      return;
    }
    if (_audience == 'SECTION_PARENTS' && _sectionId == null) {
      showToast(context, 'Choose a class.', error: true);
      return;
    }
    setState(() => _sending = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/broadcast', {
      'audience': _audience,
      'channel': _channel,
      if (_audience == 'SECTION_PARENTS') 'sectionId': _sectionId,
      if (_subject.text.trim().isNotEmpty) 'subject': _subject.text.trim(),
      'body': _body.text.trim(),
    });
    if (!mounted) return;
    setState(() => _sending = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Sent.' : 'Could not send.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      _body.clear();
      _subject.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final meta = ref.watch(adminMetaProvider);
    final sections = (meta.value?['sections'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'Broadcast',
      subtitle: 'Message a whole audience',
      icon: Icons.podcasts_rounded,
      children: [
        const SectionLabel('Audience'),
        AppDropdown<String>(
          label: 'Who',
          value: _audience,
          items: _audiences.keys.toList(),
          itemLabel: (k) => _audiences[k] ?? k,
          onChanged: (v) => setState(() => _audience = v ?? 'ALL_PARENTS'),
        ),
        if (_audience == 'SECTION_PARENTS') ...[
          const SizedBox(height: 16),
          AppDropdown<String>(
            label: 'Class',
            value: _sectionId,
            items: sections.map((s) => s['id'] as String).toList(),
            itemLabel: (id) =>
                (sections.firstWhere((s) => s['id'] == id, orElse: () => const {})['name'] as String?) ?? id,
            onChanged: (v) => setState(() => _sectionId = v),
          ),
        ],
        const SizedBox(height: 16),
        AppDropdown<String>(
          label: 'Channel',
          value: _channel,
          items: _channels,
          itemLabel: (c) => c == 'IN_APP' ? 'In-app' : c[0] + c.substring(1).toLowerCase(),
          onChanged: (v) => setState(() => _channel = v ?? 'IN_APP'),
        ),
        const SizedBox(height: 22),
        const SectionLabel('Message'),
        AppTextField(controller: _subject, label: 'Subject', hint: 'Optional'),
        const SizedBox(height: 16),
        AppTextField(controller: _body, label: 'Message', maxLines: 6),
        const SizedBox(height: 22),
        PrimaryButton(
          label: _sending ? 'Sending…' : 'Send broadcast',
          icon: Icons.send_rounded,
          onPressed: _sending ? null : _send,
        ),
      ],
    );
  }

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }
}
