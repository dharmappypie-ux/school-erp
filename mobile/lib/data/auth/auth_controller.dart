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
  static const _planKey = 'session_plan';
  static const _featuresKey = 'session_features';

  bool _ready = false;
  bool get ready => _ready;

  String? _token;
  bool get isAuthenticated => _token != null;

  UserRole _role = UserRole.parent;
  UserRole get role => _role;

  String? _name;
  String? get name => _name;

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

  Future<void> restore() async {
    _token = await _storage.read(key: _tokenKey);
    _role = UserRole.fromName(await _storage.read(key: _roleKey));
    _name = await _storage.read(key: _nameKey);
    _plan = await _storage.read(key: _planKey);
    final rawFeatures = await _storage.read(key: _featuresKey);
    _features = rawFeatures == null
        ? null
        : (rawFeatures.isEmpty ? <String>{} : rawFeatures.split(',').toSet());
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
    final res = await _api.login(email.trim(), password);

    String? serverToken;
    UserRole? serverRole;
    if (res != null) {
      serverToken = res['token'] as String?;
      final user = res['user'];
      if (user is Map) {
        _name = (user['name'] as String?)?.trim();
        final roles = (user['roles'] as List?)?.map((e) => e.toString()).toList() ?? const [];
        serverRole = _resolveRole(roles);
        _plan = (user['plan'] as String?)?.trim();
        final feats = user['features'];
        if (feats is List) {
          _features = feats.map((e) => e.toString()).toSet();
        }
      }
    }

    // Offline / API not available yet → local session so the app is usable.
    final effective = serverToken ?? 'local-${DateTime.now().millisecondsSinceEpoch}';
    _token = effective;
    _role = serverRole ?? selected ?? UserRole.parent;
    _api.setToken(serverToken); // only a real token is sent to the server

    await _storage.write(key: _tokenKey, value: effective);
    await _storage.write(key: _roleKey, value: _role.name);
    if (_name != null) await _storage.write(key: _nameKey, value: _name!);
    if (_plan != null) await _storage.write(key: _planKey, value: _plan!);
    if (_features != null) {
      await _storage.write(key: _featuresKey, value: _features!.join(','));
    }
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

  Future<void> signOut() async {
    _token = null;
    _role = UserRole.parent;
    _name = null;
    _plan = null;
    _features = null;
    _api.setToken(null);
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _roleKey);
    await _storage.delete(key: _nameKey);
    await _storage.delete(key: _planKey);
    await _storage.delete(key: _featuresKey);
    notifyListeners();
  }
}
