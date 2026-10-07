import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/models/models.dart';
import 'state/providers.dart';
import 'theme/app_theme.dart';
import 'ui/admin/admin_shell.dart';
import 'ui/screens/login_screen.dart';
import 'ui/shell/home_shell.dart';
import 'ui/teacher/teacher_shell.dart';

class VidyalayaApp extends ConsumerWidget {
  const VidyalayaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    return MaterialApp(
      title: 'Vidyalaya',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: !auth.ready
          ? const _Splash()
          : !auth.isAuthenticated
              ? const LoginScreen()
              : switch (auth.role) {
                  UserRole.admin => const AdminShell(),
                  UserRole.teacher => const TeacherShell(),
                  UserRole.parent => const HomeShell(),
                },
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.ink)),
      );
}
