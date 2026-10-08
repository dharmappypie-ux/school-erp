import 'package:flutter_test/flutter_test.dart';

import 'package:vidyalaya/theme/app_theme.dart';

void main() {
  test('design tokens are defined', () {
    expect(AppColors.bg, isNotNull);
    expect(AppRadius.card, greaterThan(0));
  });
}
