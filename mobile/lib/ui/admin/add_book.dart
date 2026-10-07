import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Adds a library book → POST /api/mobile/v1/admin/book.
class AddBookScreen extends ConsumerStatefulWidget {
  const AddBookScreen({super.key});
  @override
  ConsumerState<AddBookScreen> createState() => _AddBookScreenState();
}

class _AddBookScreenState extends ConsumerState<AddBookScreen> {
  final _title = TextEditingController();
  final _author = TextEditingController();
  final _category = TextEditingController();
  final _isbn = TextEditingController();
  final _publisher = TextEditingController();
  bool _saving = false;

  Future<void> _submit() async {
    if (_title.text.trim().isEmpty) {
      showToast(context, 'Give the book a title.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/book', {
      'title': _title.text.trim(),
      if (_author.text.trim().isNotEmpty) 'author': _author.text.trim(),
      if (_category.text.trim().isNotEmpty) 'category': _category.text.trim(),
      if (_isbn.text.trim().isNotEmpty) 'isbn': _isbn.text.trim(),
      if (_publisher.text.trim().isNotEmpty) 'publisher': _publisher.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    final msg = res.body?['message'] ?? res.body?['error'] ?? (res.ok ? 'Book added.' : 'Could not add book.');
    showToast(context, msg.toString(), error: !res.ok);
    if (res.ok) {
      ref.invalidate(moduleProvider((role: 'admin', name: 'library')));
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return DetailScaffold(
      title: 'Add book',
      subtitle: 'Adds a title to the library catalogue',
      icon: Icons.local_library_rounded,
      children: [
        const SectionLabel('Book'),
        AppTextField(controller: _title, label: 'Title', required: true),
        const SizedBox(height: 16),
        AppTextField(controller: _author, label: 'Author', hint: 'Optional'),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: AppTextField(controller: _category, label: 'Category', hint: 'Optional')),
            const SizedBox(width: 12),
            Expanded(child: AppTextField(controller: _isbn, label: 'ISBN', hint: 'Optional')),
          ],
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _publisher, label: 'Publisher', hint: 'Optional'),
        const SizedBox(height: 26),
        PrimaryButton(
          label: _saving ? 'Adding…' : 'Add to library',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _submit,
        ),
      ],
    );
  }

  @override
  void dispose() {
    _title.dispose();
    _author.dispose();
    _category.dispose();
    _isbn.dispose();
    _publisher.dispose();
    super.dispose();
  }
}
