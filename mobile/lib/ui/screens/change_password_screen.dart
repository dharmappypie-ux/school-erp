import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';

/// Replace the signed-in user's password.
///
/// Two ways in, one form:
///
///  * **forced** — the account is still on the temporary password the school
///    handed out, and the server refuses every other endpoint until it is
///    replaced. This mode is a gate: it is the whole app until the change goes
///    through, so it has no back button. It does offer sign-out, because a
///    person who cannot remember the temporary password must still be able to
///    leave.
///  * **pushed** — someone chose "Change password" from their profile. Same
///    form, ordinary detail page, back button works.
///
/// Either way the server revokes every session on success, so the screen ends
/// in a sign-out and a fresh login — which also proves the new password works.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key, this.forced = false});

  /// True when this is the gate rather than a page the user chose to open.
  final bool forced;

  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  /// The same floor the server and the web form use. Kept in step by hand —
  /// the server is the one that actually enforces it.
  static const _minLength = 10;

  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  /// Catch what we can before spending a round trip. The server checks all of
  /// this again; this is only here so the common mistakes answer instantly.
  String? _validate() {
    final current = _current.text;
    final next = _next.text;
    if (current.isEmpty) return 'Enter your current password.';
    if (next.length < _minLength) return 'Use at least $_minLength characters for the new password.';
    if (next == current) return 'Choose a password different from your current one.';
    if (_confirm.text != next) return 'The two new passwords do not match.';
    return null;
  }

  Future<void> _submit() async {
    final problem = _validate();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });

    final res = await ref.read(apiProvider).changePassword(_current.text, _next.text);
    if (!mounted) return;

    if (!res.ok) {
      setState(() {
        _busy = false;
        // A null message means the request never reached the server — nothing
        // about the password was wrong, so saying so would be a lie.
        // The request may have been accepted and only the answer lost, so
        // "nothing happened" would be a guess. Say what to do either way.
        _error = res.message ??
            'Could not reach the school server. Try again — and if the change '
            'did go through, sign in with your new password.';
      });
      return;
    }

    // Success. Every session is gone, this one included, so leave the screen
    // before the sign-out swaps the app back to the login page underneath us.
    //
    // Read the controller BEFORE popping: popping disposes this State, and a
    // disposed ConsumerState's `ref` must not be touched. The controller
    // itself is a plain ChangeNotifier and outlives the screen.
    final auth = ref.read(authProvider);
    if (!widget.forced) Navigator.of(context).popUntil((r) => r.isFirst);
    await auth.completePasswordChange(
      res.message ?? 'Password changed. Sign in again with your new password.',
    );
  }

  @override
  Widget build(BuildContext context) {
    return widget.forced ? _buildGate(context) : _buildPushed(context);
  }

  // ---- pushed: an ordinary detail page ------------------------------------

  Widget _buildPushed(BuildContext context) {
    return DetailScaffold(
      title: 'Change password',
      subtitle: 'You will sign in again afterwards',
      icon: Icons.lock_reset_rounded,
      children: [
        AppCard(child: Column(children: _formFields())),
        const SizedBox(height: 18),
        PrimaryButton(
          label: _busy ? 'Changing…' : 'Change password',
          icon: Icons.check_rounded,
          onPressed: _busy ? null : _submit,
        ),
        const SizedBox(height: 14),
        const Text(
          'Changing your password signs you out everywhere — this device and '
          'any other you have used.',
          style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4),
        ),
      ],
    );
  }

  // ---- forced: the gate ---------------------------------------------------

  Widget _buildGate(BuildContext context) {
    final name = ref.watch(authProvider).name;
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: ListView(
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
                padding: const EdgeInsets.fromLTRB(22, 22, 22, 26),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(Icons.lock_reset_rounded, color: Colors.white, size: 26),
                    ),
                    const SizedBox(height: 18),
                    // Deliberately true in both cases: a new joiner opening the
                    // app for the first time, and someone signed in for months
                    // whose password an admin has just reset. Greeting the
                    // second one with "Welcome" would be nonsense.
                    Text(
                      name == null ? 'Choose a new password' : '$name, choose a new password',
                      style: const TextStyle(
                          color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'This account is on a temporary password. Pick your own to '
                      'use the app — ask the school office if you were not given one.',
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 13.5,
                          height: 1.45),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 22, 18, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppCard(child: Column(children: _formFields())),
                const SizedBox(height: 18),
                PrimaryButton(
                  label: _busy ? 'Setting it…' : 'Set my password',
                  icon: Icons.arrow_forward_rounded,
                  onPressed: _busy ? null : _submit,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Nobody else can use your account until this is done. You will '
                  'sign in once more with the new password.',
                  style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.45),
                ),
                const SizedBox(height: 22),
                const Hairline(),
                const SizedBox(height: 8),
                // Not a dead end: someone who never received the temporary
                // password needs a way back out to ask for it.
                Center(
                  child: TextButton(
                    onPressed: _busy ? null : () => ref.read(authProvider).signOut(),
                    child: const Text(
                      'Sign out instead',
                      style: TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.muted),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ---- the shared form ----------------------------------------------------

  List<Widget> _formFields() => [
        _PasswordField(
          controller: _current,
          label: 'Current password',
          hint: 'The one you signed in with',
          icon: Icons.lock_outline_rounded,
          enabled: !_busy,
        ),
        const SizedBox(height: 14),
        _PasswordField(
          controller: _next,
          label: 'New password',
          hint: 'At least $_minLength characters',
          icon: Icons.lock_rounded,
          enabled: !_busy,
        ),
        const SizedBox(height: 14),
        _PasswordField(
          controller: _confirm,
          label: 'Confirm new password',
          hint: 'Type it once more',
          icon: Icons.lock_rounded,
          enabled: !_busy,
          onSubmitted: _busy ? null : (_) => _submit(),
        ),
        if (_error != null) ...[
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.error_outline_rounded, color: AppColors.danger, size: 17),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _error!,
                  style: const TextStyle(
                      color: AppColors.danger, fontSize: 13, height: 1.35, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ],
      ];
}

/// A labelled password field with its own show/hide toggle. Each one keeps its
/// own visibility, so revealing the new password does not reveal the old one.
class _PasswordField extends StatefulWidget {
  const _PasswordField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.enabled = true,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final bool enabled;
  final ValueChanged<String>? onSubmitted;

  @override
  State<_PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<_PasswordField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 7),
          child: Text(widget.label.toUpperCase(), style: eyebrow(AppColors.muted)),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surfaceSunken,
            borderRadius: BorderRadius.circular(AppRadius.chip),
          ),
          child: TextField(
            controller: widget.controller,
            obscureText: _obscure,
            enabled: widget.enabled,
            autocorrect: false,
            enableSuggestions: false,
            textInputAction:
                widget.onSubmitted == null ? TextInputAction.next : TextInputAction.done,
            onSubmitted: widget.onSubmitted,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            decoration: InputDecoration(
              hintText: widget.hint,
              hintStyle: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w500, fontSize: 14),
              prefixIcon: Icon(widget.icon, color: AppColors.muted, size: 19),
              // Excluded from traversal: otherwise the keyboard's "next" lands
              // on this button instead of the following field, which dismisses
              // the keyboard and looks like the form has stopped responding.
              suffixIcon: ExcludeFocus(
                child: IconButton(
                  icon: Icon(
                    _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                    color: AppColors.muted,
                    size: 19,
                  ),
                  onPressed: () => setState(() => _obscure = !_obscure),
                  tooltip: _obscure ? 'Show' : 'Hide',
                ),
              ),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              disabledBorder: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 15),
            ),
          ),
        ),
      ],
    );
  }
}
