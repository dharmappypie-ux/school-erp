import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';

/// A bottom-navigation item.
class NavItem {
  final IconData active;
  final IconData inactive;
  final String label;
  const NavItem(this.active, this.inactive, this.label);
}

/// A drawer menu entry.
class DrawerEntry {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const DrawerEntry(this.icon, this.label, this.color, this.onTap);
}

/// Shared animated bottom bar. The selected tab expands into a plum pill that
/// slides its label in; the others collapse to icons. Tapping fires a light
/// haptic. Used by every role shell so navigation feels consistent and alive.
class AppBottomBar extends StatelessWidget {
  const AppBottomBar({super.key, required this.index, required this.items, required this.onTap});
  final int index;
  final List<NavItem> items;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.line)),
        boxShadow: [BoxShadow(color: Color(0x0F1B2130), blurRadius: 16, offset: Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: _NavCell(
                    item: items[i],
                    selected: i == index,
                    onTap: () {
                      if (i != index) HapticFeedback.selectionClick();
                      onTap(i);
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavCell extends StatelessWidget {
  const _NavCell({required this.item, required this.selected, required this.onTap});
  final NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const dur = Duration(milliseconds: 260);
    const curve = Curves.easeOutCubic;
    final color = selected ? AppColors.primary : AppColors.faint;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Pill widens behind the icon when selected.
          AnimatedContainer(
            duration: dur,
            curve: curve,
            padding: EdgeInsets.symmetric(horizontal: selected ? 20 : 12, vertical: 6),
            decoration: BoxDecoration(
              color: selected ? AppColors.accentSoft : Colors.transparent,
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 1, end: selected ? 1.1 : 1),
              duration: dur,
              curve: curve,
              builder: (_, scale, child) => Transform.scale(scale: scale, child: child),
              child: Icon(selected ? item.active : item.inactive, size: 23, color: color),
            ),
          ),
          const SizedBox(height: 4),
          AnimatedDefaultTextStyle(
            duration: dur,
            curve: curve,
            style: TextStyle(
                fontSize: 11,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: color),
            child: Text(item.label, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}

/// Shared side drawer for teacher / admin — navy header + menu + sign out.
class RoleDrawer extends ConsumerWidget {
  const RoleDrawer({
    super.key,
    required this.name,
    required this.roleLabel,
    required this.subtitle,
    required this.entries,
  });
  final String name;
  final String roleLabel;
  final String subtitle;
  final List<DrawerEntry> entries;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Drawer(
      backgroundColor: AppColors.bg,
      width: 300,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: kNavyGradient,
              borderRadius: BorderRadius.only(bottomRight: Radius.circular(44)),
            ),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(22, 24, 18, 26),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: kHeroGradient,
                        border: Border.all(color: Colors.white.withValues(alpha: 0.25), width: 2),
                      ),
                      child: Center(
                        child: Text(_initials(name),
                            style: const TextStyle(
                                color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(name,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 3),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                      ),
                      child: Text('$roleLabel · $subtitle',
                          style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              children: [
                for (final e in entries)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () {
                        Navigator.pop(context);
                        e.onTap();
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                        child: Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                  color: e.color.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(11)),
                              child: Icon(e.icon, size: 19, color: e.color),
                            ),
                            const SizedBox(width: 14),
                            Text(e.label,
                                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => ref.read(authProvider).signOut(),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                      color: AppColors.dangerSoft, borderRadius: BorderRadius.circular(16)),
                  child: Row(
                    children: const [
                      Icon(Icons.power_settings_new_rounded, color: AppColors.danger, size: 20),
                      SizedBox(width: 12),
                      Text('Sign out',
                          style: TextStyle(
                              color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 14.5)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(' ');
    return (parts.first.isNotEmpty ? parts.first[0] : '') +
        (parts.length > 1 && parts.last.isNotEmpty ? parts.last[0] : '');
  }
}
