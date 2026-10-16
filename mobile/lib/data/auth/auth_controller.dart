import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/models.dart';
import '../remote/api_client.dart';

/// Session state. A real token (from the backend's `/auth/login`) is stored in
/// the OS keychain/keystore, along with the resolved experience ([UserRole])
/// and the account's permissions, so the app re-opens straight into the right
/// home with the right modules.
///
/// There is ONE sign-in screen: the server's roles decide the experience, the
/// way the web console's single login does. Nothing is picked by hand, so an
/// account can never open a surface its roles don't grant.
///
/// Offline, a device that has signed in before re-opens the last experience it
/// saw for that email; a device that never has cannot sign in at all, because
/// only the server can say who an email belongs to.
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
  static const _emailKey = 'session_email';
  static const _planKey = 'session_plan';
  static const _featuresKey = 'session_features';
  static const _permissionsKey = 'session_permissions';
  static const _rolesKey = 'session_roles';
  static const _mustChangeKey = 'session_must_change';
  // Survives sign-out on purpose: it is what lets a device that HAS signed in
  // before open the right experience when the server can't be reached.
  static const _lastEmailKey = 'last_email';
  static const _lastRoleKey = 'last_role';

  bool _ready = false;
  bool get ready => _ready;

  String? _token;
  bool get isAuthenticated => _token != null;

  UserRole _role = UserRole.parent;
  UserRole get role => _role;

  String? _name;
  String? get name => _name;

  String? _email;
  String? get email => _email;

  /// The backend role keys this account holds (SUPER_ADMIN, TEACHER, PARENT…).
  List<String> _roleKeys = const [];
  List<String> get roleKeys => _roleKeys;

  /// Every permission the account's roles grant, unioned — the same list the
  /// web sidebar filters on. `null` means "not known" (an offline session),
  /// in which case [can] answers yes and the server remains the real gate.
  Set<String>? _permissions;
  Set<String>? get permissions => _permissions;

  /// Does this account hold [permission]? Understands the server's wildcards:
  /// `"*"` grants everything and `"fees.*"` grants every action in a module.
  /// Mirrors `hasPermission` in `src/lib/permissions.ts`.
  bool can(String permission) {
    final granted = _permissions;
    if (granted == null) return true; // unknown → don't hide; server still gates
    if (granted.contains('*')) return true;
    if (granted.contains(permission)) return true;
    final module = permission.split('.').first;
    return granted.contains('$module.*');
  }

  /// Any one of [permissions] (empty list = always allowed).
  bool canAny(List<String> permissions) =>
      permissions.isEmpty || permissions.any(can);

  /// The school's subscription plan (e.g. "PREMIUM"), or null when unknown.
  String? _plan;
  String? get plan => _plan;

  /// The gated features the plan unlocks. `null` means "not known yet" (an
  /// offline/local session) — in that case nothing is hidden; an empty set is a
  /// known state (a plan with no gated features) and does hide them.
  Set<String>? _features;
  Set<String>? get features => _features;

  /// Whether a feature tile should be shown. Unknown plan → always shown.
  bool allowsFeature(String feature) =>
      _features == null || _features!.contains(feature);

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
    _email = await _storage.read(key: _emailKey);
    _plan = await _storage.read(key: _planKey);
    _features = _decodeSet(await _storage.read(key: _featuresKey));
    _permissions = _decodeSet(await _storage.read(key: _permissionsKey));
    _roleKeys = _decodeSet(await _storage.read(key: _rolesKey))?.toList() ?? const [];
    _mustChangePassword = await _storage.read(key: _mustChangeKey) == '1';
    _api.setToken(_token);
    _ready = true;
    notifyListeners();
  }

  /// null (absent) stays null — "not known"; an empty string is a known-empty
  /// set, which does hide things.
  static Set<String>? _decodeSet(String? raw) => raw == null
      ? null
      : (raw.isEmpty ? <String>{} : raw.split(',').where((e) => e.isNotEmpty).toSet());

  /// Re-reads the account's identity, roles, permissions and plan from the
  /// server.
  ///
  /// A stored session carries the answers from the day it was created; a role
  /// edited since then would otherwise keep showing the old modules until the
  /// next sign-in. Called once on launch for a real session — never for an
  /// offline one, which has no server to ask and must not be downgraded by the
  /// silence.
  Future<void> refreshSession() async {
    final token = _token;
    if (token == null || token.startsWith('local-')) return;

    final me = await _api.getJson('/api/mobile/v1/me');
    if (me == null) return; // offline, or a 401/403 the hooks already handled

    final roles = (me['roleKeys'] as List?)?.map((e) => e.toString()).toList();
    final perms = (me['permissions'] as List?)?.map((e) => e.toString()).toSet();
    final feats = (me['features'] as List?)?.map((e) => e.toString()).toSet();
    if (roles == null && perms == null) return; // not the shape we expect

    _name = (me['name'] as String?)?.trim() ?? _name;
    _email = (me['email'] as String?)?.trim() ?? _email;
    if (roles != null) {
      _roleKeys = roles;
      _role = UserRole.bestOf(roles);
    }
    if (perms != null) _permissions = perms;
    if (feats != null) _features = feats;
    _plan = (me['plan'] as String?)?.trim() ?? _plan;

    await _persistSession();
    notifyListeners();
  }

  /// Returns null on success, or an error message.
  ///
  /// There is nothing to choose: the experience that opens is whatever the
  /// account's roles say it is. A single screen, as on the web.
  Future<String?> signIn(String email, String password) async {
    final address = email.trim().toLowerCase();
    if (address.isEmpty || password.isEmpty) {
      return 'Enter your email and password.';
    }
    final result = await _api.login(address, password);
    // The server answered, and the answer was no. Falling through to the
    // offline session here would call a wrong password a successful sign-in.
    if (result.error != null) return result.error;
    final res = result.body;

    if (res == null) {
      // No answer at all — the server is unreachable. Only a device that has
      // signed this address in before knows which experience to open, and only
      // the server can verify a password, so an unknown device must wait.
      return _offlineSignIn(address);
    }

    final token = res['token'] as String?;
    if (token == null) return 'The server did not return a session.';

    final user = res['user'];
    if (user is Map) {
      _name = (user['name'] as String?)?.trim();
      _email = (user['email'] as String?)?.trim() ?? address;
      _roleKeys = (user['roles'] as List?)?.map((e) => e.toString()).toList() ?? const [];
      _role = UserRole.bestOf(_roleKeys);
      _plan = (user['plan'] as String?)?.trim();
      final feats = user['features'];
      _features = feats is List ? feats.map((e) => e.toString()).toSet() : null;
      final perms = user['permissions'];
      _permissions = perms is List ? perms.map((e) => e.toString()).toSet() : null;
    } else {
      _email = address;
      _role = UserRole.parent;
    }

    _token = token;
    _mustChangePassword = res['mustChangePassword'] == true;
    _api.setToken(token);
    await _persistSession();
    notifyListeners();
    return null;
  }

  /// The server could not be reached. The on-device database is the source of
  /// truth for everything the app shows, so a device that already knows this
  /// address re-opens its last experience and works offline; anything else is
  /// refused rather than guessed.
  Future<String?> _offlineSignIn(String address) async {
    final lastEmail = await _storage.read(key: _lastEmailKey);
    if (lastEmail == null || lastEmail != address) {
      return "Can't reach the server, and this device hasn't signed in as "
          '$address before. Connect once to set it up.';
    }
    _token = 'local-${DateTime.now().millisecondsSinceEpoch}';
    _email = address;
    _role = UserRole.fromName(await _storage.read(key: _lastRoleKey));
    _name = await _storage.read(key: _nameKey);
    // Unknown, not empty: an offline session hides nothing, and there is no
    // server data on the other side of the gate to protect.
    _features = null;
    _permissions = null;
    _roleKeys = const [];
    _mustChangePassword = false;
    _api.setToken(null); // never send a fabricated token to the server
    await _persistSession();
    notifyListeners();
    return null;
  }

  Future<void> _persistSession() async {
    await _storage.write(key: _tokenKey, value: _token);
    await _storage.write(
        key: _mustChangeKey, value: _mustChangePassword ? '1' : '0');
    await _storage.write(key: _roleKey, value: _role.name);
    await _storage.write(key: _nameKey, value: _name);
    await _storage.write(key: _emailKey, value: _email);
    await _storage.write(key: _planKey, value: _plan);
    await _storage.write(key: _featuresKey, value: _features?.join(','));
    await _storage.write(key: _permissionsKey, value: _permissions?.join(','));
    await _storage.write(
        key: _rolesKey, value: _roleKeys.isEmpty ? null : _roleKeys.join(','));
    // Kept past sign-out so the next offline sign-in knows this device.
    await _storage.write(key: _lastEmailKey, value: _email);
    await _storage.write(key: _lastRoleKey, value: _role.name);
  }

  /// [notice] is the one-shot message for the login screen. It is set as part
  /// of signing out rather than before it, so the notify that builds the login
  /// screen already carries it — and so an ordinary sign-out clears any stale
  /// notice instead of letting it surface on an unrelated later visit.
  Future<void> signOut({String? notice}) async {
    _token = null;
    _role = UserRole.parent;
    _name = null;
    _email = null;
    _plan = null;
    _features = null;
    _permissions = null;
    _roleKeys = const [];
    _mustChangePassword = false;
    _api.setToken(null);
    for (final key in const [
      _tokenKey, _roleKey, _nameKey, _emailKey, _planKey,
      _featuresKey, _permissionsKey, _rolesKey, _mustChangeKey,
    ]) {
      await _storage.delete(key: key);
    }
    // `last_email` / `last_role` deliberately survive: they are how the next
    // offline sign-in recognises this device.
    _notice = notice;
    notifyListeners();
  }
}
