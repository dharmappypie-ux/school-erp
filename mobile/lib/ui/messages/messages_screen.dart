import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Conversation list → open a thread → reply. New-conversation via the FAB.
class MessagesScreen extends ConsumerWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(messageThreadsProvider);
    final items = (async.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final offline = !async.isLoading && async.value == null;

    return DetailScaffold(
      title: 'Messages',
      subtitle: offline ? 'Not loaded' : '${items.length} conversations',
      icon: Icons.forum_rounded,
      onRefresh: () async => ref.invalidate(messageThreadsProvider),
      fab: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NewMessageScreen())),
        icon: const Icon(Icons.edit_rounded),
        label: const Text('New'),
      ),
      children: [
        if (async.isLoading)
          const SizedBox(height: 140, child: Center(child: CircularProgressIndicator()))
        else if (offline)
          const AppCard(child: Row(children: [
            Icon(Icons.cloud_off_rounded, color: AppColors.warn), SizedBox(width: 12),
            Expanded(child: Text("Couldn't reach the school — pull down to retry.",
                style: TextStyle(color: AppColors.muted))),
          ]))
        else if (items.isEmpty)
          const AppCard(child: Text('No conversations yet. Tap New to start one.',
              style: TextStyle(color: AppColors.muted)))
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(children: [
              for (var i = 0; i < items.length; i++) ...[
                _ThreadRow(t: items[i]),
                if (i < items.length - 1) const Hairline(),
              ],
            ]),
          ),
      ],
    );
  }
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({required this.t});
  final Map<String, dynamic> t;
  @override
  Widget build(BuildContext context) {
    final unread = t['unread'] == true;
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => ThreadScreen(threadId: t['id'] as String, name: t['name']?.toString() ?? ''))),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(children: [
          if (unread)
            Container(width: 8, height: 8, margin: const EdgeInsets.only(right: 10),
                decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t['name']?.toString() ?? '',
                  style: TextStyle(fontSize: 14.5, fontWeight: unread ? FontWeight.w800 : FontWeight.w600)),
              const SizedBox(height: 2),
              Text(t['preview']?.toString() ?? '',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
            ]),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
        ]),
      ),
    );
  }
}

/// One conversation: messages + a reply box.
class ThreadScreen extends ConsumerStatefulWidget {
  const ThreadScreen({super.key, required this.threadId, required this.name});
  final String threadId;
  final String name;
  @override
  ConsumerState<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends ConsumerState<ThreadScreen> {
  final _reply = TextEditingController();
  bool _sending = false;

  Future<void> _send() async {
    if (_reply.text.trim().isEmpty) return;
    setState(() => _sending = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/messages/send', {
      'threadId': widget.threadId, 'body': _reply.text.trim(),
    });
    if (!mounted) return;
    setState(() => _sending = false);
    if (res.ok) {
      _reply.clear();
      ref.invalidate(messageThreadProvider(widget.threadId));
      ref.invalidate(messageThreadsProvider);
    } else {
      showToast(context, (res.body?['error'] ?? 'Could not send.').toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(messageThreadProvider(widget.threadId));
    final messages = (async.value?['messages'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text(widget.name),
      ),
      body: Column(children: [
        Expanded(
          child: async.isLoading
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    for (final m in messages) _Bubble(m: m),
                  ],
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _reply,
                  minLines: 1, maxLines: 4,
                  decoration: InputDecoration(
                    hintText: 'Message…',
                    filled: true, fillColor: AppColors.surface,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: _sending ? null : _send,
                child: Container(
                  width: 46, height: 46,
                  decoration: const BoxDecoration(gradient: kHeroGradient, shape: BoxShape.circle),
                  child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.m});
  final Map<String, dynamic> m;
  @override
  Widget build(BuildContext context) {
    final mine = m['mine'] == true;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.74),
        decoration: BoxDecoration(
          color: mine ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: kCardShadow,
        ),
        child: Text(m['body']?.toString() ?? '',
            style: TextStyle(color: mine ? Colors.white : AppColors.ink, height: 1.3)),
      ),
    );
  }
}

/// Pick a staff recipient + write the first message.
class NewMessageScreen extends ConsumerStatefulWidget {
  const NewMessageScreen({super.key});
  @override
  ConsumerState<NewMessageScreen> createState() => _NewMessageScreenState();
}

class _NewMessageScreenState extends ConsumerState<NewMessageScreen> {
  String? _recipientId;
  final _body = TextEditingController();
  bool _sending = false;

  Future<void> _send() async {
    if (_recipientId == null || _body.text.trim().isEmpty) {
      showToast(context, 'Pick someone and write a message.', error: true);
      return;
    }
    setState(() => _sending = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/messages/send', {
      'recipientId': _recipientId, 'body': _body.text.trim(),
    });
    if (!mounted) return;
    setState(() => _sending = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Sent.' : 'Could not send.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(messageThreadsProvider);
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final recipients = ref.watch(messageRecipientsProvider);
    final items = (recipients.value?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];

    return DetailScaffold(
      title: 'New message',
      subtitle: 'Message a staff member',
      icon: Icons.edit_rounded,
      children: [
        if (recipients.isLoading)
          const SizedBox(height: 100, child: Center(child: CircularProgressIndicator()))
        else ...[
          const SectionLabel('To'),
          AppDropdown<String>(
            label: 'Recipient',
            value: _recipientId,
            items: items.map((r) => r['userId'] as String).toList(),
            itemLabel: (id) {
              final r = items.firstWhere((e) => e['userId'] == id, orElse: () => const {});
              return '${r['name'] ?? id} · ${r['role'] ?? ''}';
            },
            onChanged: (v) => setState(() => _recipientId = v),
          ),
          const SizedBox(height: 16),
          const SectionLabel('Message'),
          AppTextField(controller: _body, label: 'Your message', maxLines: 5),
          const SizedBox(height: 22),
          PrimaryButton(
            label: _sending ? 'Sending…' : 'Send message',
            icon: Icons.send_rounded,
            onPressed: _sending ? null : _send,
          ),
        ],
      ],
    );
  }

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }
}
