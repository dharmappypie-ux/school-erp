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

  /// Called when the server refuses a *valid* token because the account still
  /// carries a temporary password. Unlike 401 this is not a dead session, so
  /// the auth layer raises the change-password gate rather than signing out.
  /// It can start mid-session: an admin resetting a password flags an account
  /// that is already signed in on this device.
  void Function()? onPasswordChangeRequired;

  void setToken(String? token) => _token = token;

  /// The backend origin, so screens can build absolute URLs for server-relative
  /// asset paths (e.g. an attachment's `/uploads/...`).
  String get baseUrl => _dio.options.baseUrl;

  /// Absolute URL for a server path that may be relative (e.g. `/uploads/x.pdf`).
  String absoluteUrl(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    return path.startsWith('/') ? '$base$path' : '$base/$path';
  }

  Options get _auth => Options(
        headers: _token == null ? null : {'Authorization': 'Bearer $_token'},
        validateStatus: (s) => s != null && s < 500,
      );

  /// Fire the session hooks when the server rejects a real token. A local
  /// offline token is never sent, so nothing it comes back with means anything.
  void _check(int? status, [Object? body]) {
    if (_token == null || _token!.startsWith('local-')) return;
    if (status == 401) {
      onUnauthorized?.call();
    } else if (status == 403 &&
        body is Map &&
        body['code'] == 'PASSWORD_CHANGE_REQUIRED') {
      onPasswordChangeRequired?.call();
    }
  }

  /// Pulls the latest snapshot for the signed-in child. Returns null when the
  /// server has no mobile API yet / is unreachable — the caller then keeps the
  /// local data as-is rather than wiping it.
  Future<ServerSnapshot?> pull() async {
    try {
      final res = await _dio.get('/api/mobile/v1/me/snapshot', options: _auth);
      _check(res.statusCode, res.data);
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
      _check(res.statusCode, res.data);
      return res.statusCode == 200 || res.statusCode == 201;
    } on DioException {
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Signs in, returning `{token, user:{..., roles:[...]}, mustChangePassword}`
  /// as [body] on success.
  ///
  /// A refusal the server actually sent comes back as [error]. It must not be
  /// confused with being offline: the caller falls back to a local session when
  /// it cannot reach a server, and treating a wrong password that way would
  /// report a typo as a successful sign-in and then show this device's local
  /// data as though it were that account's. Only a request that never landed
  /// leaves both fields null.
  Future<({Map<String, dynamic>? body, String? error})> login(
      String email, String password) async {
    try {
      final res = await _dio.post(
        '/api/mobile/v1/auth/login',
        data: {'email': email, 'password': password},
        options: _auth,
      );
      final body =
          res.data is Map ? Map<String, dynamic>.from(res.data as Map) : null;
      if (res.statusCode == 200 && body != null) {
        return (body: body, error: null);
      }
      return (
        body: null,
        error: body?['error'] as String? ?? 'Could not sign you in.',
      );
    } on DioException catch (e) {
      if (e.response == null) return (body: null, error: null); // never landed
      final errBody = e.response!.data is Map
          ? Map<String, dynamic>.from(e.response!.data as Map)
          : null;
      return (
        body: null,
        error: errBody?['error'] as String? ??
            'The server could not sign you in just now.',
      );
    } catch (_) {
      return (body: null, error: null);
    }
  }

  /// Replaces the signed-in user's password. The server revokes every session
  /// on success — including this one — so the caller must sign out afterwards.
  ///
  /// Returns `(ok, message)`. A null [message] on failure means the server was
  /// never reached, which the caller words differently from a server's own
  /// refusal: offline there is nothing the user can do but find a connection.
  Future<({bool ok, String? message})> changePassword(
      String currentPassword, String newPassword) async {
    // An offline session holds a 'local-' token that is never sent, so the
    // server would answer a bare 401 and the screen would show the word
    // "Unauthorized" to someone whose only problem is having no signal.
    if (_token == null) {
      return (
        ok: false,
        message: 'You are signed in offline on this device. Connect to the '
            'internet and sign in again to change your password.',
      );
    }
    try {
      final res = await _dio.post(
        '/api/mobile/v1/auth/change-password',
        data: {'currentPassword': currentPassword, 'newPassword': newPassword},
        options: _auth,
      );
      final body =
          res.data is Map ? Map<String, dynamic>.from(res.data as Map) : null;
      if (res.statusCode == 200 && body?['ok'] == true) {
        return (ok: true, message: body?['message'] as String?);
      }
      // A 401 here is a genuinely dead session, not a wrong password — that
      // comes back as 400. Let the stale-session hook bounce them to login.
      _check(res.statusCode, res.data);
      return (ok: false, message: body?['error'] as String?);
    } on DioException catch (e) {
      // No response at all means the request never landed — offline, and the
      // caller says so. A 5xx did land (it escapes validateStatus as an
      // exception) and is a server fault, which reads very differently.
      if (e.response == null) return (ok: false, message: null);
      final body = e.response!.data is Map
          ? Map<String, dynamic>.from(e.response!.data as Map)
          : null;
      return (
        ok: false,
        message: body?['error'] as String? ??
            'The server could not change the password just now.',
      );
    } catch (_) {
      return (ok: false, message: null);
    }
  }

  // ---- generic authed helpers (teacher / admin surfaces) -----------------

  /// GET a JSON object from an authed endpoint. Returns null offline / on error.
  Future<Map<String, dynamic>?> getJson(String path, {Map<String, dynamic>? query}) async {
    try {
      final res = await _dio.get(path, queryParameters: query, options: _auth);
      _check(res.statusCode, res.data);
      if (res.statusCode == 200 && res.data is Map) {
        return Map<String, dynamic>.from(res.data as Map);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /// POST a file to an authed endpoint as multipart/form-data under the field
  /// name `file` — the shape the bulk-import endpoints share with the web
  /// console's upload form. Bytes rather than a path, because the web build has
  /// no filesystem to point at.
  Future<({bool ok, Map<String, dynamic>? body})> postFile(
    String path, {
    required List<int> bytes,
    required String filename,
  }) async {
    try {
      final form = FormData.fromMap({
        'file': MultipartFile.fromBytes(bytes, filename: filename),
      });
      final res = await _dio.post(path, data: form, options: _auth);
      _check(res.statusCode, res.data);
      final body = res.data is Map ? Map<String, dynamic>.from(res.data as Map) : null;
      return (ok: res.statusCode == 200, body: body);
    } on DioException catch (e) {
      final body = e.response?.data is Map
          ? Map<String, dynamic>.from(e.response!.data as Map)
          : null;
      return (ok: false, body: body);
    } catch (_) {
      return (ok: false, body: null);
    }
  }

  /// POST JSON to an authed endpoint. Returns `(ok, body)` so the caller can
  /// surface the server's message on both success and validation failure.
  Future<({bool ok, Map<String, dynamic>? body})> postJson(
      String path, Map<String, dynamic> data) async {
    try {
      final res = await _dio.post(path, data: data, options: _auth);
      _check(res.statusCode, res.data);
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
