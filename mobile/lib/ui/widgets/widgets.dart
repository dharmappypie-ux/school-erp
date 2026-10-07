import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// White rounded card with the house soft shadow.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(18), this.onTap});
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.card),
        boxShadow: kCardShadow,
      ),
      child: child,
    );
    if (onTap == null) return card;
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.card),
      onTap: onTap,
      child: card,
    );
  }
}

/// The signature plum→teal hero card (profile, balance, totals). Pass a custom
/// [gradient] for a different accent (e.g. navy).
class DarkCard extends StatelessWidget {
  const DarkCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.gradient = kHeroGradient,
    this.shadow = kHeroShadow,
  });
  final Widget child;
  final EdgeInsets padding;
  final Gradient gradient;
  final List<BoxShadow> shadow;

  @override
  Widget build(BuildContext context) => Container(
        padding: padding,
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(AppRadius.card),
          boxShadow: shadow,
        ),
        child: child,
      );
}

/// Reusable page header: hamburger (opens the side drawer) + eyebrow/title and
/// an optional trailing widget (usually the sync pill). Used on every tab so
/// the side menu is always one tap away.
class AppScreenHeader extends StatelessWidget {
  const AppScreenHeader({super.key, required this.title, this.eyebrowText, this.trailing});
  final String title;
  final String? eyebrowText;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    // Adaptive: inside a shell tab (a Scaffold with a drawer) show the
    // hamburger; when the screen was pushed (no drawer, can pop) show a back
    // arrow instead so the header works in both places.
    final hasDrawer = Scaffold.maybeOf(context)?.hasDrawer ?? false;
    final showBack = !hasDrawer && Navigator.of(context).canPop();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _MenuButton(
          icon: showBack ? Icons.arrow_back_rounded : Icons.menu_rounded,
          onTap: showBack
              ? () => Navigator.of(context).maybePop()
              : () => Scaffold.maybeOf(context)?.openDrawer(),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (eyebrowText != null) ...[
                Text(eyebrowText!, style: eyebrow(AppColors.muted)),
                const SizedBox(height: 2),
              ],
              Text(title,
                  style: const TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _MenuButton extends StatelessWidget {
  const _MenuButton({required this.onTap, this.icon = Icons.menu_rounded});
  final VoidCallback onTap;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              boxShadow: kCardShadow,
            ),
            child: Icon(icon, color: AppColors.ink, size: 22),
          ),
        ),
      );
}

/// Full-screen scaffold for a pushed detail page: a plum→teal gradient header
/// with a back button, title + subtitle and an optional hero body, then the
/// scrollable content below.
class DetailScaffold extends StatelessWidget {
  const DetailScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
    this.hero,
    this.icon,
    this.onRefresh,
    this.fab,
  });
  final String title;
  final String subtitle;
  final List<Widget> children;
  final Widget? hero;
  final IconData? icon;
  final Future<void> Function()? onRefresh;
  final Widget? fab;

  @override
  Widget build(BuildContext context) {
    final body = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: [
        Container(
          decoration: const BoxDecoration(
            gradient: kHeroGradient,
            borderRadius: BorderRadius.only(
              bottomLeft: Radius.circular(28),
              bottomRight: Radius.circular(28),
            ),
            boxShadow: kHeroShadow,
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 18, 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _CircleIconButton(
                        icon: Icons.arrow_back_rounded,
                        onTap: () => Navigator.of(context).maybePop(),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title,
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 2),
                            Text(subtitle,
                                style: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5)),
                          ],
                        ),
                      ),
                      if (icon != null)
                        Icon(icon, color: Colors.white.withValues(alpha: 0.9), size: 26),
                    ],
                  ),
                  if (hero != null) ...[const SizedBox(height: 20), hero!],
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 20, 18, 28),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
        ),
      ],
    );
    return Scaffold(
      backgroundColor: AppColors.bg,
      floatingActionButton: fab,
      body: onRefresh == null
          ? body
          : RefreshIndicator(color: AppColors.primary, onRefresh: onRefresh!, child: body),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white.withValues(alpha: 0.16),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
              width: 42, height: 42, child: Icon(icon, color: Colors.white, size: 20)),
        ),
      );
}

/// A compact stat card: coloured icon chip, big value, caption. Used in the
/// home dashboard grid.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
    this.onTap,
  });
  final IconData icon;
  final String value;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 21, color: color),
          ),
          const SizedBox(height: 14),
          Text(value,
              style: const TextStyle(
                  fontSize: 22, fontWeight: FontWeight.w800, height: 1, letterSpacing: -0.5)),
          const SizedBox(height: 3),
          Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
        ],
      ),
    );
  }
}

/// Horizontal progress bar used in courses / homework.
class ProgressBar extends StatelessWidget {
  const ProgressBar({super.key, required this.value, this.color = AppColors.primary, this.height = 8});
  final double value; // 0..1
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(height),
        child: LinearProgressIndicator(
          value: value.clamp(0, 1),
          minHeight: height,
          backgroundColor: color.withValues(alpha: 0.14),
          valueColor: AlwaysStoppedAnimation(color),
        ),
      );
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
        child: Row(
          children: [
            Text(text.toUpperCase(), style: eyebrow(AppColors.muted)),
            const Spacer(),
            if (trailing != null) trailing!,
          ],
        ),
      );
}

/// A list row inside a card: round icon tile, title + subtitle, trailing.
class RowTile extends StatelessWidget {
  const RowTile({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.iconColor,
    this.iconBg,
    this.trailing,
    this.onTap,
  });
  final String title;
  final String? subtitle;
  final IconData? icon;
  final Color? iconColor;
  final Color? iconBg;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              if (icon != null) ...[
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: iconBg ?? AppColors.surfaceSunken,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(icon, size: 20, color: iconColor ?? AppColors.ink),
                ),
                const SizedBox(width: 14),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.ink)),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(subtitle!,
                          style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                    ],
                  ],
                ),
              ),
              if (trailing != null) trailing! else if (onTap != null)
                const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
            ],
          ),
        ),
      );
}

class ToggleRow extends StatelessWidget {
  const ToggleRow({super.key, required this.title, required this.subtitle, required this.value, required this.onChanged});
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 14.5, fontWeight: FontWeight.w600, color: AppColors.ink)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Switch.adaptive(
              value: value,
              onChanged: onChanged,
              activeTrackColor: AppColors.primary,
              activeThumbColor: Colors.white,
            ),
          ],
        ),
      );
}

class Hairline extends StatelessWidget {
  const Hairline({super.key});
  @override
  Widget build(BuildContext context) =>
      const Divider(height: 1, thickness: 1, color: AppColors.line);
}

/// Plum pill button.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, this.onPressed, this.icon, this.expand = true});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final btn = DecoratedBox(
      decoration: BoxDecoration(
        gradient: enabled ? kHeroGradient : null,
        color: enabled ? null : AppColors.faint,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.pill),
          onTap: onPressed,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 15),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[Icon(icon, size: 18, color: Colors.white), const SizedBox(width: 8)],
                Text(label,
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14.5)),
              ],
            ),
          ),
        ),
      ),
    );
    return expand ? Row(children: [Expanded(child: btn)]) : btn;
  }
}

/// A tiny status chip summarising the sync state.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, required this.color, required this.bg, this.busy = false, this.icon});
  final String label;
  final Color color;
  final Color bg;
  final bool busy;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (busy)
              SizedBox(
                width: 12,
                height: 12,
                child: CircularProgressIndicator(strokeWidth: 2, color: color),
              )
            else if (icon != null)
              Icon(icon, size: 13, color: color),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
          ],
        ),
      );
}

/// Minimal sparkline for the balance/trend card.
class Sparkline extends StatelessWidget {
  const Sparkline(this.points, {super.key, this.color = Colors.white, this.height = 48});
  final List<double> points;
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(painter: _SparkPainter(points, color)),
      );
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.points, this.color);
  final List<double> points;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;
    final minv = points.reduce((a, b) => a < b ? a : b);
    final maxv = points.reduce((a, b) => a > b ? a : b);
    final range = (maxv - minv).abs() < 0.001 ? 1 : (maxv - minv);
    final dx = size.width / (points.length - 1);
    Offset at(int i) => Offset(
        i * dx, size.height - ((points[i] - minv) / range) * (size.height - 6) - 3);

    final path = Path()..moveTo(at(0).dx, at(0).dy);
    for (var i = 1; i < points.length; i++) {
      final prev = at(i - 1), cur = at(i);
      final mid = Offset((prev.dx + cur.dx) / 2, (prev.dy + cur.dy) / 2);
      path.quadraticBezierTo(prev.dx, prev.dy, mid.dx, mid.dy);
      path.quadraticBezierTo(cur.dx, cur.dy, cur.dx, cur.dy);
    }
    final fill = Path.from(path)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
        fill,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [color.withValues(alpha: 0.22), color.withValues(alpha: 0.0)],
          ).createShader(Offset.zero & size));
    canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round);
    canvas.drawCircle(at(points.length - 1), 3.5, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _SparkPainter old) => old.points != points;
}
