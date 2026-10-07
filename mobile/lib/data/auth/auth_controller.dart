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
  AuthController(this._api, this._storage);

  final ApiClient _api;
  final FlutterSecureStorage _storage;
  static const _tokenKey = 'session_token';
  static const _roleKey = 'session_role';
  static const _nameKey = 'session_name';

  bool _ready = false;
  bool get ready => _ready;

  String? _token;
  bool get isAuthenticated => _token != null;

  UserRole _role = UserRole.parent;
  UserRole get role => _role;

  String? _name;
  String? get name => _name;

  Future<void> restore() async {
    _token = await _storage.read(key: _tokenKey);
    _role = UserRole.fromName(await _storage.read(key: _roleKey));
    _name = await _storage.read(key: _nameKey);
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
    _api.setToken(null);
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _roleKey);
    await _storage.delete(key: _nameKey);
    notifyListeners();
  }
}
