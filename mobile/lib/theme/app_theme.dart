import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Design system for the Vidyalaya companion app — a bold, colourful field
/// app in the spirit of the purple/teal reference: a plum→teal gradient on the
/// hero surfaces, a dark navy side drawer, white rounded cards floating on a
/// cool light-grey ground, and bright accent chips. Hierarchy comes from colour
/// and one strong gradient, not from greys alone.
class AppColors {
  static const bg = Color(0xFFECEDF1); // cool light-grey ground
  static const surface = Color(0xFFFFFFFF); // white cards
  static const surfaceSunken = Color(0xFFF0F1F5);
  static const ink = Color(0xFF1B2130); // near-black text
  static const muted = Color(0xFF878D9C); // secondary text
  static const faint = Color(0xFFB7BCCA);
  static const line = Color(0xFFE8EAF0); // hairline divider

  // Brand — plum + teal, the two gradient stops of the reference.
  static const primary = Color(0xFF8E2C82); // plum / magenta
  static const primaryDark = Color(0xFF6D1F66);
  static const teal = Color(0xFF13A3AE);
  static const tealDark = Color(0xFF0C8993);
  static const accent = primary; // interactive accent
  static const accentSoft = Color(0xFFF4E7F2); // light plum tint
  static const tealSoft = Color(0xFFDCF2F4);

  // Dark navy — the side drawer + any deep surface.
  static const navy = Color(0xFF28303E);
  static const navySoft = Color(0xFF353F50);
  static const dark = navy; // kept for back-compat with existing callers
  static const darkSoft = navySoft;

  static const onDark = Color(0xFFF4F6F8);
  static const onDarkMuted = Color(0xFFB4BECB);
  static const gold = Color(0xFFE0A83C);
  static const good = Color(0xFF1E9E6A);
  static const goodSoft = Color(0xFFDBF3E8);
  static const warn = Color(0xFFCB7A26);
  static const warnSoft = Color(0xFFFBEBD7);
  static const danger = Color(0xFFCB4747);
  static const dangerSoft = Color(0xFFF8E2E2);
}

/// The signature plum→teal hero gradient used on headers and hero cards.
const kHeroGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [AppColors.primary, AppColors.teal],
);

/// The navy gradient used in the drawer header.
const kNavyGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [AppColors.navySoft, AppColors.navy],
);

class AppRadius {
  static const card = 22.0;
  static const chip = 14.0;
  static const pill = 100.0;
}

class AppTheme {
  static ThemeData light() {
    final base = ThemeData(brightness: Brightness.light, useMaterial3: true);
    final TextTheme text = GoogleFonts.plusJakartaSansTextTheme().apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
    );
    return base.copyWith(
      scaffoldBackgroundColor: AppColors.bg,
      colorScheme: base.colorScheme.copyWith(
        primary: AppColors.primary,
        secondary: AppColors.teal,
        surface: AppColors.surface,
        surfaceTint: Colors.transparent,
      ),
      textTheme: text,
      splashColor: Colors.transparent,
      highlightColor: AppColors.surfaceSunken,
      dividerColor: AppColors.line,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        foregroundColor: AppColors.ink,
      ),
    );
  }
}

/// A soft, barely-there card shadow reused everywhere.
const kCardShadow = [
  BoxShadow(color: Color(0x141B2130), blurRadius: 22, offset: Offset(0, 10)),
  BoxShadow(color: Color(0x08000000), blurRadius: 2, offset: Offset(0, 1)),
];

/// Coloured shadow that gives the gradient hero its lift.
const kHeroShadow = [
  BoxShadow(color: Color(0x388E2C82), blurRadius: 28, offset: Offset(0, 16)),
];

/// Uppercase micro-label used above sections and inside cards.
TextStyle eyebrow(Color color) => GoogleFonts.plusJakartaSans(
      fontSize: 11,
      fontWeight: FontWeight.w700,
      letterSpacing: 1.2,
      color: color,
    );
