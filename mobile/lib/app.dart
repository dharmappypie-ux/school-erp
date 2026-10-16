import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/models/models.dart';
import 'state/providers.dart';
import 'theme/app_theme.dart';
import 'ui/admin/admin_shell.dart';
import 'ui/screens/change_password_screen.dart';
import 'ui/screens/login_screen.dart';
import 'ui/platform/platform_shell.dart';
import 'ui/shell/home_shell.dart';
import 'ui/teacher/teacher_shell.dart';

class VidyalayaApp extends ConsumerWidget {
  const VidyalayaApp({super.key});

  /// The root navigator, so losing the session can clear what is on top of it.
  ///
  /// Swapping [MaterialApp.home] only replaces the '/' route. Every detail
  /// screen in this app is pushed onto this same navigator (there is no nested
  /// one), so without this the gate — or the login screen — is installed
  /// invisibly *underneath* whatever the user is looking at. That is the normal
  /// case rather than the odd one: the 403 that raises the gate mid-session is
  /// the answer to a request a freshly-pushed screen just made.
  static final navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);

    // No session, or a session the server refuses: nothing pushed may outlive
    // it. Scheduled after the frame because the navigator cannot be mutated
    // during a build, and a no-op when the stack is already at its root.
    if (auth.ready && (!auth.isAuthenticated || auth.mustChangePassword)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        navigatorKey.currentState?.popUntil((route) => route.isFirst);
      });
    }

    return MaterialApp(
      title: 'Vidyalaya',
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: !auth.ready
          ? const _Splash()
          : !auth.isAuthenticated
              ? const LoginScreen()
              // Signed in, but the server refuses everything until the
              // temporary password is replaced — so this IS the app until
              // it is. Not a pushed route: there is nothing to go back to.
              : auth.mustChangePassword
              ? const ChangePasswordScreen(forced: true)
              // Which experience opens is the server's answer, not a choice
              // made on the sign-in screen: the account's roles decide it.
              : switch (auth.role) {
                  UserRole.owner => const PlatformShell(),
                  UserRole.admin => const AdminShell(),
                  UserRole.teacher => const TeacherShell(),
                  UserRole.student => const HomeShell(role: UserRole.student),
                  UserRole.parent => const HomeShell(role: UserRole.parent),
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
