import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// Labelled text field used across the create forms.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.controller,
    required this.label,
    this.hint,
    this.keyboard,
    this.maxLines = 1,
    this.required = false,
    this.onChanged,
  });
  final TextEditingController controller;
  final String label;
  final String? hint;
  final TextInputType? keyboard;
  final int maxLines;
  final bool required;
  /// Optional: for fields that react as you type, such as a search box.
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label, required: required),
        const SizedBox(height: 7),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            boxShadow: kCardShadow,
          ),
          child: TextField(
            controller: controller,
            keyboardType: keyboard,
            maxLines: maxLines,
            onChanged: onChanged,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            decoration: InputDecoration(
              hintText: hint ?? label,
              hintStyle: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w500),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 15, horizontal: 16),
            ),
          ),
        ),
      ],
    );
  }
}

/// Labelled dropdown used across the create forms.
class AppDropdown<T> extends StatelessWidget {
  const AppDropdown({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.itemLabel,
    required this.onChanged,
    this.required = false,
  });
  final String label;
  final T? value;
  final List<T> items;
  final String Function(T) itemLabel;
  final ValueChanged<T?> onChanged;
  final bool required;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label, required: required),
        const SizedBox(height: 7),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            boxShadow: kCardShadow,
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<T>(
              value: value,
              isExpanded: true,
              hint: Text('Select $label',
                  style: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w500, fontSize: 15)),
              icon: const Icon(Icons.expand_more_rounded, color: AppColors.muted),
              borderRadius: BorderRadius.circular(16),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.ink),
              items: [
                for (final it in items)
                  DropdownMenuItem(value: it, child: Text(itemLabel(it), overflow: TextOverflow.ellipsis)),
              ],
              onChanged: onChanged,
            ),
          ),
        ),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text, {required this.required});
  final String text;
  final bool required;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 4),
        child: Text.rich(TextSpan(children: [
          TextSpan(text: text.toUpperCase(), style: eyebrow(AppColors.muted)),
          if (required)
            const TextSpan(text: ' *', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w800)),
        ])),
      );
}

/// Show a themed snackbar.
void showToast(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    behavior: SnackBarBehavior.floating,
    backgroundColor: error ? AppColors.danger : AppColors.ink,
    content: Text(message, style: const TextStyle(fontWeight: FontWeight.w600)),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
  ));
}
