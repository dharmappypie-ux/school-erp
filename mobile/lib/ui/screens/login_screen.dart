import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

/// The one sign-in screen, for every kind of account.
///
/// There is deliberately no role picker: a parent, student, teacher, any staff
/// role and the platform owner all sign in here with the same two fields, and
/// the account's own roles decide which experience opens — exactly as the web
/// console's `/login` does. Picking a role by hand could only ever disagree
/// with the server, and the server would win.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  /// One-shot message from the auth layer — e.g. after a password change
  /// signed every session out. Read once, in initState, because reading it
  /// clears it.
  String? _notice;

  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    final auth = ref.read(authProvider);
    _notice = auth.takeNotice();
    // Whoever signed in last on this device, so a returning user only types a
    // password. Never pre-filled with a password.
    _email.text = auth.email ?? '';
  }

  Future<void> _submit() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await ref.read(authProvider).signIn(_email.text, _password.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                        gradient: kHeroGradient,
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: kHeroShadow),
                    alignment: Alignment.center,
                    child: const Text('V',
                        style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(height: 26),
                  const Text('Welcome to Vidyalaya',
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.6)),
                  const SizedBox(height: 6),
                  const Text('Sign in with your school account.',
                      style: TextStyle(fontSize: 14.5, color: AppColors.muted)),
                  if (_notice != null) ...[
                    const SizedBox(height: 18),
                    _Banner(
                      _notice!,
                      icon: Icons.check_circle_outline_rounded,
                      color: AppColors.good,
                      background: AppColors.goodSoft,
                    ),
                  ],
                  const SizedBox(height: 22),
                  _field(_email, 'Email', Icons.alternate_email_rounded,
                      keyboard: TextInputType.emailAddress),
                  const SizedBox(height: 12),
                  _field(_password, 'Password', Icons.lock_outline_rounded,
                      obscure: _obscure,
                      onSubmitted: (_) => _submit(),
                      suffix: IconButton(
                        icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                            color: AppColors.muted, size: 20),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      )),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    _Banner(
                      _error!,
                      icon: Icons.error_outline_rounded,
                      color: AppColors.danger,
                      background: AppColors.dangerSoft,
                    ),
                  ],
                  const SizedBox(height: 22),
                  PrimaryButton(
                    label: _busy ? 'Signing in…' : 'Sign in',
                    onPressed: _busy ? null : _submit,
                  ),
                  const SizedBox(height: 16),
                  const Center(
                    child: Text(
                      'Forgotten your password?\nAsk your school administrator to reset it.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: AppColors.faint, height: 1.5),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String hint, IconData icon,
      {bool obscure = false,
      Widget? suffix,
      TextInputType? keyboard,
      ValueChanged<String>? onSubmitted}) {
    return Semantics(
      // The hint is a placeholder, not a label. A screen reader announced the
      // password field — its visibility button carries a name — and said
      // nothing at all for the email one.
      textField: true,
      label: hint,
      child: Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: kCardShadow,
      ),
      child: TextField(
        controller: c,
        obscureText: obscure,
        keyboardType: keyboard,
        onSubmitted: onSubmitted,
        textInputAction: onSubmitted == null ? TextInputAction.next : TextInputAction.go,
        autocorrect: false,
        enableSuggestions: false,
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        decoration: InputDecoration(
          hintText: hint,
          prefixIcon: Icon(icon, color: AppColors.muted, size: 20),
          suffixIcon: suffix,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(vertical: 18, horizontal: 6),
        ),
      ),
      ),
    );
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }
}

/// A tinted notice/error strip. Errors are shown as prominently as the success
/// notice because a refusal that looks like a hint reads as success.
class _Banner extends StatelessWidget {
  const _Banner(this.message,
      {required this.icon, required this.color, required this.background});
  final String message;
  final IconData icon;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(AppRadius.chip),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(message,
                  style: TextStyle(
                      fontSize: 13,
                      height: 1.35,
                      fontWeight: FontWeight.w600,
                      color: color)),
            ),
          ],
        ),
      );
}
