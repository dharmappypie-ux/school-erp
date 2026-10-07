import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

import '../local/app_database.dart';
import '../remote/api_client.dart';

enum SyncPhase { idle, syncing, synced, offline, error }

@immutable
class SyncState {
  final SyncPhase phase;
  final DateTime? lastSyncedAt;
  final int pending;
  final String? message;

  const SyncState({
    this.phase = SyncPhase.idle,
    this.lastSyncedAt,
    this.pending = 0,
    this.message,
  });

  SyncState copyWith({
    SyncPhase? phase,
    DateTime? lastSyncedAt,
    int? pending,
    String? message,
  }) =>
      SyncState(
        phase: phase ?? this.phase,
        lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
        pending: pending ?? this.pending,
        message: message,
      );
}

/// Orchestrates offline-first synchronisation.
///
/// - **Manual**: `sync(manual: true)` — the pull-to-refresh and "Sync now"
///   button. Always attempts a round trip and reports the outcome.
/// - **Auto**: fires when connectivity returns, on a periodic timer, and when
///   the caller signals the app resumed (`onResumed`). Quiet — it never blocks
///   the UI and leaves local data intact when the server is unreachable.
///
/// Every run pushes the local outbox first (so offline edits reach the server
/// in order) and then pulls a fresh snapshot.
class SyncService extends ChangeNotifier {
  SyncService(this._db, this._api);

  final AppDatabase _db;
  final ApiClient _api;

  SyncState _state = const SyncState();
  SyncState get state => _state;

  Timer? _timer;
  StreamSubscription? _connSub;
  bool _running = false;

  bool _autoSync = true;
  bool get autoSync => _autoSync;

  Future<void> start() async {
    _autoSync = await _db.getFlag('autoSync', def: true);
    _state = _state.copyWith(
      lastSyncedAt: await _db.lastSyncedAt(),
      pending: await _db.pendingCount(),
    );
    notifyListeners();

    if (_autoSync) _enableAuto();

    // An initial attempt on launch (regardless of the auto-sync setting).
    unawaited(sync());
  }

  void _enableAuto() {
    // Auto-sync when connectivity is (re)gained.
    _connSub ??= Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online) sync();
    });
    // Auto-sync on a gentle cadence.
    _timer ??= Timer.periodic(const Duration(minutes: 15), (_) => sync());
  }

  void _disableAuto() {
    _connSub?.cancel();
    _connSub = null;
    _timer?.cancel();
    _timer = null;
  }

  /// Turn background auto-sync on/off (persisted). Manual sync always works.
  Future<void> setAutoSync(bool value) async {
    if (_autoSync == value) return;
    _autoSync = value;
    await _db.setFlag('autoSync', value);
    if (value) {
      _enableAuto();
      unawaited(sync());
    } else {
      _disableAuto();
    }
    notifyListeners();
  }

  /// Call from the widget tree when the app returns to the foreground.
  void onResumed() {
    if (_autoSync) sync();
  }

  /// Recompute the unsynced-change count (call after a local write).
  Future<void> refreshPending() async {
    _state = _state.copyWith(pending: await _db.pendingCount());
    notifyListeners();
  }

  /// Runs a full sync. Safe to call concurrently — overlapping calls coalesce.
  Future<void> sync({bool manual = false}) async {
    if (_running) return;
    _running = true;
    _state = _state.copyWith(phase: SyncPhase.syncing, message: null);
    notifyListeners();

    try {
      final connectivity = await Connectivity().checkConnectivity();
      final online = connectivity.any((r) => r != ConnectivityResult.none);
      if (!online) {
        _state = _state.copyWith(
          phase: SyncPhase.offline,
          message: 'You are offline. Changes are saved on this device.',
        );
        return;
      }

      // 1. Push queued local edits, oldest first.
      final queued = await _db.outbox();
      final pushed = <int>[];
      for (final item in queued) {
        final ok = await _api.push(item);
        if (ok && item.id != null) {
          pushed.add(item.id!);
        } else {
          break; // keep order; retry the rest next time
        }
      }
      await _db.clearOutbox(pushed);

      // 2. Pull a fresh snapshot.
      final snap = await _api.pull();
      if (snap == null) {
        // Reachable network but no mobile API yet — not an error, just offline
        // from the app's point of view. Local data stays authoritative.
        _state = _state.copyWith(
          phase: SyncPhase.offline,
          pending: await _db.pendingCount(),
          message: 'Server sync not available yet — running on local data.',
        );
        return;
      }

      await _db.applyServerSnapshot(
        student: snap.student,
        invoices: snap.invoices,
        notices: snap.notices,
      );

      final now = DateTime.now();
      await _db.setLastSyncedAt(now);
      _state = _state.copyWith(
        phase: SyncPhase.synced,
        lastSyncedAt: now,
        pending: await _db.pendingCount(),
        message: 'Up to date',
      );
    } catch (e) {
      _state = _state.copyWith(phase: SyncPhase.error, message: 'Sync failed: $e');
    } finally {
      _running = false;
      notifyListeners();
      // A manual sync should leave a real pending count visible.
      if (manual) await refreshPending();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _connSub?.cancel();
    super.dispose();
  }
}
