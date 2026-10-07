import 'package:dio/dio.dart';

import '../models/models.dart';

/// Thin REST client for the Vidyalaya backend's (planned) `/api/mobile/v1`
/// surface. Until those endpoints ship it simply reports the server as
/// unreachable, and the app keeps running entirely on its local database — the
/// whole point of the offline-first design. Swap `baseUrl` for your deployment
/// and the same code path starts syncing for real.
class ApiClient {
  ApiClient({String? baseUrl})
      : _dio = Dio(BaseOptions(
          // Override at build time with --dart-define=API_BASE=… ; defaults to
          // the live deployment.
          baseUrl: baseUrl ??
              const String.fromEnvironment('API_BASE',
                  defaultValue: 'https://school-erp-six-ashy.vercel.app'),
          connectTimeout: const Duration(seconds: 12),
          receiveTimeout: const Duration(seconds: 25),
          sendTimeout: const Duration(seconds: 25),
        ));

  final Dio _dio;
  String? _token;

  /// Called when an authed request is rejected with 401 while a token is set —
  /// i.e. the stored session is stale/expired (e.g. after switching backends).
  /// The auth layer uses this to sign out and bounce the user to a fresh login
  /// instead of showing permanently blank screens.
  void Function()? onUnauthorized;

  void setToken(String? token) => _token = token;

  Options get _auth => Options(
        headers: _token == null ? null : {'Authorization': 'Bearer $_token'},
        validateStatus: (s) => s != null && s < 500,
      );

  /// Fire the stale-session hook when the server rejects a real token.
  void _check(int? status) {
    if (status == 401 && _token != null && !_token!.startsWith('local-')) {
      onUnauthorized?.call();
    }
  }

  /// Pulls the latest snapshot for the signed-in child. Returns null when the
  /// server has no mobile API yet / is unreachable — the caller then keeps the
  /// local data as-is rather than wiping it.
  Future<ServerSnapshot?> pull() async {
    try {
      final res = await _dio.get('/api/mobile/v1/me/snapshot', options: _auth);
      _check(res.statusCode);
      if (res.statusCode != 200 || res.data is! Map) return null;
      return ServerSnapshot.fromJson(res.data as Map<String, dynamic>);
    } on DioException {
      return null; // offline or endpoint absent — stay on local data
    } catch (_) {
      return null;
    }
  }

  /// Pushes one queued local change. Returns true when the server accepted it
  /// (so it can be removed from the outbox); false means keep it for next time.
  Future<bool> push(OutboxItem item) async {
    try {
      final res = await _dio.post(
        '/api/mobile/v1/outbox',
        data: {'kind': item.kind, 'entityId': item.entityId, 'payload': item.payload},
        options: _auth,
      );
      _check(res.statusCode);
      return res.statusCode == 200 || res.statusCode == 201;
    } on DioException {
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Returns the login response `{token, user:{..., roles:[...]}}` on success,
  /// or null if auth is unavailable/incorrect (the app then falls back to a
  /// local offline session).
  Future<Map<String, dynamic>?> login(String email, String password) async {
    try {
      final res = await _dio.post(
        '/api/mobile/v1/auth/login',
        data: {'email': email, 'password': password},
        options: _auth,
      );
      if (res.statusCode == 200 && res.data is Map) {
        return Map<String, dynamic>.from(res.data as Map);
      }
      return null;
    } on DioException {
      return null;
    } catch (_) {
      return null;
    }
  }

  // ---- generic authed helpers (teacher / admin surfaces) -----------------

  /// GET a JSON object from an authed endpoint. Returns null offline / on error.
  Future<Map<String, dynamic>?> getJson(String path, {Map<String, dynamic>? query}) async {
    try {
      final res = await _dio.get(path, queryParameters: query, options: _auth);
      _check(res.statusCode);
      if (res.statusCode == 200 && res.data is Map) {
        return Map<String, dynamic>.from(res.data as Map);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /// POST JSON to an authed endpoint. Returns `(ok, body)` so the caller can
  /// surface the server's message on both success and validation failure.
  Future<({bool ok, Map<String, dynamic>? body})> postJson(
      String path, Map<String, dynamic> data) async {
    try {
      final res = await _dio.post(path, data: data, options: _auth);
      _check(res.statusCode);
      final body = res.data is Map ? Map<String, dynamic>.from(res.data as Map) : null;
      final ok = res.statusCode == 200 || res.statusCode == 201;
      return (ok: ok, body: body);
    } on DioException catch (e) {
      final body = e.response?.data is Map
          ? Map<String, dynamic>.from(e.response!.data as Map)
          : null;
      return (ok: false, body: body);
    } catch (_) {
      return (ok: false, body: null);
    }
  }
}

class ServerSnapshot {
  final Student? student;
  final List<FeeInvoice>? invoices;
  final List<AppNotice>? notices;
  const ServerSnapshot({this.student, this.invoices, this.notices});

  factory ServerSnapshot.fromJson(Map<String, dynamic> j) => ServerSnapshot(
        student: j['student'] is Map
            ? Student.fromMap(Map<String, Object?>.from(j['student'] as Map))
            : null,
        invoices: j['invoices'] is List
            ? (j['invoices'] as List)
                .map((e) => FeeInvoice.fromMap(Map<String, Object?>.from(e as Map)))
                .toList()
            : null,
        notices: j['notices'] is List
            ? (j['notices'] as List)
                .map((e) => AppNotice.fromMap(Map<String, Object?>.from(e as Map)))
                .toList()
            : null,
      );
}
