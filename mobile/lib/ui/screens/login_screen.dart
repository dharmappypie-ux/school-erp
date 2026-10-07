import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  // Demo credentials per experience (see DEMO_LOGINS.txt).
  static const _demo = {
    UserRole.parent: 'parent.gis20260001@greenwood.edu.in',
    UserRole.teacher: 'teacher1@greenwood.edu.in',
    UserRole.admin: 'admin@greenwood.edu.in',
  };

  UserRole _role = UserRole.parent;
  final _email = TextEditingController(text: _demo[UserRole.parent]);
  final _password = TextEditingController(text: 'Password123');
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  void _pickRole(UserRole r) {
    setState(() {
      _role = r;
      _email.text = _demo[r]!;
    });
  }

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; });
    final err = await ref.read(authProvider).signIn(_email.text, _password.text, selected: _role);
    if (!mounted) return;
    setState(() { _busy = false; _error = err; });
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
                  const Text('Choose your role and sign in.',
                      style: TextStyle(fontSize: 14.5, color: AppColors.muted)),
                  const SizedBox(height: 22),
                  _RoleSelector(role: _role, onChanged: _pickRole),
                  const SizedBox(height: 18),
                  _field(_email, 'Email', Icons.alternate_email_rounded,
                      keyboard: TextInputType.emailAddress),
                  const SizedBox(height: 12),
                  _field(_password, 'Password', Icons.lock_outline_rounded,
                      obscure: _obscure,
                      suffix: IconButton(
                        icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                            color: AppColors.muted, size: 20),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      )),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
                  ],
                  const SizedBox(height: 22),
                  PrimaryButton(
                    label: _busy ? 'Signing in…' : 'Sign in as ${_role.label}',
                    onPressed: _busy ? null : _submit,
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: Text(
                      'Works offline — sign in and use the app even\nbefore the server sync is available.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: AppColors.faint, height: 1.4),
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
      {bool obscure = false, Widget? suffix, TextInputType? keyboard}) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: kCardShadow,
      ),
      child: TextField(
        controller: c,
        obscureText: obscure,
        keyboardType: keyboard,
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        decoration: InputDecoration(
          hintText: hint,
          prefixIcon: Icon(icon, color: AppColors.muted, size: 20),
          suffixIcon: suffix,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(vertical: 18, horizontal: 6),
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

class _RoleSelector extends StatelessWidget {
  const _RoleSelector({required this.role, required this.onChanged});
  final UserRole role;
  final ValueChanged<UserRole> onChanged;

  static const _roles = [
    (UserRole.parent, Icons.family_restroom_rounded),
    (UserRole.teacher, Icons.co_present_rounded),
    (UserRole.admin, Icons.admin_panel_settings_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: kCardShadow,
      ),
      child: Row(
        children: [
          for (final (r, icon) in _roles)
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(r),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    gradient: r == role ? kHeroGradient : null,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    children: [
                      Icon(icon,
                          size: 22, color: r == role ? Colors.white : AppColors.muted),
                      const SizedBox(height: 5),
                      Text(r.label,
                          style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: r == role ? Colors.white : AppColors.muted)),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
