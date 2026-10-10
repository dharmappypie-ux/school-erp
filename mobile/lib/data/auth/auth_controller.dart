import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/models.dart';
import '../remote/api_client.dart';

/// Session state. A real token (from the backend's `/auth/login`) is stored in
/// the OS keychain/keystore, along with the resolved experience ([UserRole]) so
/// the app re-opens straight into the right home. When the server is
/// unreachable, sign-in falls back to a local session using the role the user
/// picked on the login screen, so the offline-first app is still usable.
class AuthController extends ChangeNotifier {
  AuthController(this._api, this._storage) {
    // A stale/expired token (e.g. left over from a previous backend) makes every
    // authed screen come back empty. Treat a 401 as "session gone": clear it and
    // send the user back to a fresh login instead of showing blank screens.
    _api.onUnauthorized = _handleUnauthorized;
    // Not a dead session — a live one the server refuses until the temporary
    // password is replaced. Raise the gate instead of signing out.
    _api.onPasswordChangeRequired = requirePasswordChange;
  }

  bool _signingOut = false;
  void _handleUnauthorized() {
    if (_token == null || _signingOut) return;
    _signingOut = true;
    signOut().whenComplete(() => _signingOut = false);
  }

  final ApiClient _api;
  final FlutterSecureStorage _storage;
  static const _tokenKey = 'session_token';
  static const _roleKey = 'session_role';
  static const _nameKey = 'session_name';
  static const _mustChangeKey = 'session_must_change';

  bool _ready = false;
  bool get ready => _ready;

  String? _token;
  bool get isAuthenticated => _token != null;

  UserRole _role = UserRole.parent;
  UserRole get role => _role;

  String? _name;
  String? get name => _name;

  /// True while the account is still on a temporary password. The server
  /// refuses every endpoint but `auth/change-password` in this state, so the
  /// app shows the change-password gate rather than screens that can only come
  /// back empty. Persisted, so force-quitting is not a way around it.
  bool _mustChangePassword = false;
  bool get mustChangePassword => _mustChangePassword;

  /// A one-shot message for the login screen — set when a password change
  /// signs the user out, so the sign-in page can say why they are back there.
  /// Reading it clears it.
  String? _notice;
  String? takeNotice() {
    final n = _notice;
    _notice = null;
    return n;
  }

  /// The server refused a valid token because the password is still temporary.
  /// Only meaningful for a real session: an offline local session never talks
  /// to the server, and gating it would strand the user on a screen that
  /// cannot work without a connection.
  void requirePasswordChange() {
    if (_token == null || _token!.startsWith('local-')) return;
    if (_mustChangePassword) return;
    _mustChangePassword = true;
    _storage.write(key: _mustChangeKey, value: '1');
    notifyListeners();
  }

  /// Called once the server has accepted a new password. It revoked every
  /// session in the process — including this one — so the only correct next
  /// step is a fresh sign-in, which also proves the new password works.
  Future<void> completePasswordChange(String message) =>
      signOut(notice: message);

  Future<void> restore() async {
    _token = await _storage.read(key: _tokenKey);
    _role = UserRole.fromName(await _storage.read(key: _roleKey));
    _name = await _storage.read(key: _nameKey);
    _mustChangePassword = await _storage.read(key: _mustChangeKey) == '1';
    _api.setToken(_token);
    _ready = true;
    notifyListeners();
  }

  /// Returns null on success, or an error message. [selected] is the experience
  /// the user chose on the login screen; it decides the role when offline and
  /// is overridden by the server's actual role when the login round-trips.
  Future<String?> signIn(String email, String password, {UserRole? selected}) async {
    if (email.trim().isEmpty || password.isEmpty) {
      return 'Enter your email and password.';
    }
    final result = await _api.login(email.trim(), password);
    // The server answered, and the answer was no. Falling through to the
    // offline session here would call a wrong password a successful sign-in.
    if (result.error != null) return result.error;
    final res = result.body;

    String? serverToken;
    UserRole? serverRole;
    bool serverMustChange = false;
    if (res != null) {
      serverToken = res['token'] as String?;
      serverMustChange = res['mustChangePassword'] == true;
      final user = res['user'];
      if (user is Map) {
        _name = (user['name'] as String?)?.trim();
        final roles = (user['roles'] as List?)?.map((e) => e.toString()).toList() ?? const [];
        serverRole = _resolveRole(roles);
      }
    }

    // Offline / API not available yet → local session so the app is usable.
    final effective = serverToken ?? 'local-${DateTime.now().millisecondsSinceEpoch}';
    _token = effective;
    _role = serverRole ?? selected ?? UserRole.parent;
    // Only a real session can be gated: the flag is the server's, and an
    // offline session has no server to ask — nor any server data to protect.
    _mustChangePassword = serverToken != null && serverMustChange;
    _api.setToken(serverToken); // only a real token is sent to the server

    await _storage.write(key: _tokenKey, value: effective);
    await _storage.write(
        key: _mustChangeKey, value: _mustChangePassword ? '1' : '0');
    await _storage.write(key: _roleKey, value: _role.name);
    if (_name != null) await _storage.write(key: _nameKey, value: _name!);
    notifyListeners();
    return null;
  }

  /// Pick the most capable experience among a user's backend roles.
  UserRole _resolveRole(List<String> roleKeys) {
    final mapped = roleKeys.map(UserRole.fromServer);
    if (mapped.contains(UserRole.admin)) return UserRole.admin;
    if (mapped.contains(UserRole.teacher)) return UserRole.teacher;
    return UserRole.parent;
  }

  /// [notice] is the one-shot message for the login screen. It is set as part
  /// of signing out rather than before it, so the notify that builds the login
  /// screen already carries it — and so an ordinary sign-out clears any stale
  /// notice instead of letting it surface on an unrelated later visit.
  Future<void> signOut({String? notice}) async {
    _token = null;
    _role = UserRole.parent;
    _name = null;
    _mustChangePassword = false;
    _api.setToken(null);
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _roleKey);
    await _storage.delete(key: _nameKey);
    await _storage.delete(key: _mustChangeKey);
    _notice = notice;
    notifyListeners();
  }
}
