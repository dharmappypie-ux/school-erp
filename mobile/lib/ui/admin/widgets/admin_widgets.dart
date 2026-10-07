import 'package:flutter/material.dart';

import '../../../theme/app_theme.dart';

/// Small plum gradient "+" button for the admin list headers.
class AddButton extends StatelessWidget {
  const AddButton({super.key, required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              gradient: kHeroGradient,
              borderRadius: BorderRadius.circular(14),
              boxShadow: kHeroShadow,
            ),
            child: const Icon(Icons.add_rounded, color: Colors.white, size: 24),
          ),
        ),
      );
}
