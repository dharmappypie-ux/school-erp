import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi_web/sqflite_ffi_web.dart';

import '../models/models.dart';

/// The on-device SQLite store. This is the app's source of truth: every screen
/// reads from here, so the UI is fully functional offline. The sync service
/// reconciles it with the server in the background (and on demand). Local
/// writes land here immediately and are queued in `outbox` to be pushed later.
class AppDatabase {
  AppDatabase._(this._db);
  final Database _db;

  static Future<AppDatabase> open() async {
    final Database db;
    if (kIsWeb) {
      // On web, SQLite is IndexedDB-backed. Use the no-web-worker factory: some
      // embedded browsers block the worker, which surfaces as null results.
      db = await databaseFactoryFfiWebNoWebWorker.openDatabase(
        'vidyalaya.db',
        options: OpenDatabaseOptions(version: 1, onCreate: _onCreate),
      );
    } else {
      final dir = await getApplicationDocumentsDirectory();
      db = await openDatabase(
        p.join(dir.path, 'vidyalaya.db'),
        version: 1,
        onCreate: _onCreate,
      );
    }
    // Aux tables (results/homework/courses/attendance) are created defensively
    // with IF NOT EXISTS so existing installs pick them up without a migration.
    await _ensureAux(db);
    // Seed after open rather than inside onCreate: the web SQLite worker can't
    // return row-ids for inserts run during onCreate.
    final seeded = await db.query('students', limit: 1);
    if (seeded.isEmpty) await _seed(db);
    if ((await db.query('subjects', limit: 1)).isEmpty) await _seedAux(db);
    return AppDatabase._(db);
  }

  static Future<void> _ensureAux(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS subjects(
        id TEXT PRIMARY KEY, subject TEXT, marks INTEGER, maxMarks INTEGER, grade TEXT)''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS homework(
        id TEXT PRIMARY KEY, subject TEXT, title TEXT, dueDate TEXT, done INTEGER)''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS courses(
        id TEXT PRIMARY KEY, title TEXT, subject TEXT, lessons INTEGER, lessonsDone INTEGER)''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS attendance_days(
        id TEXT PRIMARY KEY, date TEXT, status TEXT)''');
  }

  static Future<void> _onCreate(Database db, int _) async {
    await db.execute('''
      CREATE TABLE students(
        id TEXT PRIMARY KEY, name TEXT, admissionNo TEXT, className TEXT,
        feeBalance REAL, attendancePercent INTEGER, avgPercent INTEGER, trend TEXT)''');
    await db.execute('''
      CREATE TABLE invoices(
        id TEXT PRIMARY KEY, title TEXT, amount REAL, paid REAL,
        dueDate TEXT, status TEXT)''');
    await db.execute('''
      CREATE TABLE notices(
        id TEXT PRIMARY KEY, title TEXT, body TEXT, date TEXT, read INTEGER)''');
    await db.execute('''
      CREATE TABLE prefs(
        key TEXT PRIMARY KEY, label TEXT, subtitle TEXT, grp TEXT, enabled INTEGER)''');
    await db.execute('''
      CREATE TABLE outbox(
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, entityId TEXT,
        payload TEXT, createdAt TEXT)''');
    await db.execute('CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT)');
  }

  // ---- reads -------------------------------------------------------------
  Future<Student?> student() async {
    final rows = await _db.query('students', limit: 1);
    return rows.isEmpty ? null : Student.fromMap(rows.first);
  }

  Future<List<FeeInvoice>> invoices() async {
    final rows = await _db.query('invoices', orderBy: 'dueDate');
    return rows.map(FeeInvoice.fromMap).toList();
  }

  Future<List<AppNotice>> notices() async {
    final rows = await _db.query('notices', orderBy: 'date DESC');
    return rows.map(AppNotice.fromMap).toList();
  }

  Future<List<Pref>> prefs() async {
    final rows = await _db.query('prefs');
    return rows
        .map((m) => Pref.fromMap({...m, 'group': m['grp']}))
        .toList();
  }

  Future<List<SubjectResult>> results() async {
    final rows = await _db.query('subjects', orderBy: 'subject');
    return rows.map(SubjectResult.fromMap).toList();
  }

  Future<List<HomeworkItem>> homework() async {
    final rows = await _db.query('homework', orderBy: 'dueDate');
    return rows.map(HomeworkItem.fromMap).toList();
  }

  Future<List<CourseItem>> courses() async {
    final rows = await _db.query('courses', orderBy: 'title');
    return rows.map(CourseItem.fromMap).toList();
  }

  Future<List<AttendanceDay>> attendanceDays() async {
    final rows = await _db.query('attendance_days', orderBy: 'date DESC', limit: 30);
    return rows.map(AttendanceDay.fromMap).toList();
  }

  // ---- writes (offline-first: persist now, queue for push) ---------------
  Future<void> setPref(String key, bool enabled) async {
    await _db.update('prefs', {'enabled': enabled ? 1 : 0},
        where: 'key = ?', whereArgs: [key]);
    await _enqueue('pref.toggle', key, {'enabled': enabled});
  }

  Future<void> markNoticeRead(String id) async {
    await _db.update('notices', {'read': 1}, where: 'id = ?', whereArgs: [id]);
    await _enqueue('notice.read', id, {'read': true});
  }

  Future<void> setHomeworkDone(String id, bool done) async {
    await _db.update('homework', {'done': done ? 1 : 0}, where: 'id = ?', whereArgs: [id]);
    await _enqueue('homework.done', id, {'done': done});
  }

  Future<void> _enqueue(String kind, String entityId, Map<String, Object?> payload) async {
    await _put(_db, 'outbox', {
      'kind': kind,
      'entityId': entityId,
      'payload': jsonEncode(payload),
      'createdAt': DateTime.now().toIso8601String(),
    });
  }

  // ---- persisted preference flags (meta table) --------------------------
  Future<bool> getFlag(String key, {bool def = true}) async {
    final r = await _db.query('meta', where: 'k = ?', whereArgs: ['flag.$key']);
    if (r.isEmpty) return def;
    return (r.first['v'] as String) == '1';
  }

  Future<void> setFlag(String key, bool value) async {
    await _put(_db, 'meta', {'k': 'flag.$key', 'v': value ? '1' : '0'});
  }

  // ---- outbox / sync bookkeeping ----------------------------------------
  Future<List<OutboxItem>> outbox() async {
    final rows = await _db.query('outbox', orderBy: 'id');
    return rows.map(OutboxItem.fromMap).toList();
  }

  Future<int> pendingCount() async {
    final r = await _db.rawQuery('SELECT COUNT(*) c FROM outbox');
    return (r.first['c'] as int?) ?? 0;
  }

  Future<void> clearOutbox(List<int> ids) async {
    if (ids.isEmpty) return;
    final q = List.filled(ids.length, '?').join(',');
    await _db.delete('outbox', where: 'id IN ($q)', whereArgs: ids);
  }

  Future<DateTime?> lastSyncedAt() async {
    final r = await _db.query('meta', where: 'k = ?', whereArgs: ['lastSyncedAt']);
    if (r.isEmpty) return null;
    return DateTime.tryParse(r.first['v'] as String);
  }

  Future<void> setLastSyncedAt(DateTime at) async {
    await _put(_db, 'meta', {'k': 'lastSyncedAt', 'v': at.toIso8601String()});
  }

  /// Upsert server data from a pull into the local tables.
  Future<void> applyServerSnapshot({
    Student? student,
    List<FeeInvoice>? invoices,
    List<AppNotice>? notices,
  }) async {
    // The server is authoritative for these, so a pull replaces the local set
    // (the seed/previous rows) rather than merging — otherwise rows with new
    // server ids would pile up alongside the old ones.
    if (student != null) {
      await _db.delete('students');
      await _put(_db, 'students', student.toMap());
    }
    if (invoices != null) {
      await _db.delete('invoices');
      for (final i in invoices) {
        await _put(_db, 'invoices', i.toMap());
      }
    }
    if (notices != null) {
      await _db.delete('notices');
      for (final n in notices) {
        await _put(_db, 'notices', n.toMap());
      }
    }
  }
}

/// Portable upsert via `execute` rather than `insert`. The web SQLite worker
/// cannot return a row-id for `insert`, which throws "unsupported result null";
/// `execute` fetches no result and works the same on web, iOS and Android.
Future<void> _put(DatabaseExecutor db, String table, Map<String, Object?> m) async {
  final cols = m.keys.toList();
  final placeholders = List.filled(cols.length, '?').join(',');
  await db.execute(
    'INSERT OR REPLACE INTO $table(${cols.join(',')}) VALUES($placeholders)',
    cols.map((c) => m[c]).toList(),
  );
}

// ---- first-run demo data so the app is useful offline, immediately -------
Future<void> _seed(DatabaseExecutor db) async {
  final now = DateTime.now();
  await _put(db, 'students', {
    'id': 'gis20260001',
    'name': 'Pari Shah',
    'admissionNo': 'GIS20260001',
    'className': 'Class 5 · A',
    'feeBalance': 6500.0,
    'attendancePercent': 94,
    'avgPercent': 82,
    'trend': '62,68,71,74,79,80,82',
  });

  final invoices = [
    ['inv1', 'Term 2 Tuition', 18500.0, 18500.0, 12, 'paid'],
    ['inv2', 'Transport — Oct', 2200.0, 0.0, -3, 'overdue'],
    ['inv3', 'Lab & Library', 3500.0, 0.0, 9, 'due'],
    ['inv4', 'Annual Day', 800.0, 0.0, 18, 'due'],
  ];
  for (final v in invoices) {
    await _put(db, 'invoices', {
      'id': v[0],
      'title': v[1],
      'amount': v[2],
      'paid': v[3],
      'dueDate': now.add(Duration(days: v[4] as int)).toIso8601String(),
      'status': v[5],
    });
  }

  final notices = [
    ['n1', 'Parent–teacher meeting', 'Please join us in the main hall at 9:30 AM. We will share your child\'s progress for the term.', 1, 0],
    ['n2', 'Half-yearly results published', 'Report cards are now available under Results.', 2, 0],
    ['n3', 'Diwali break', 'School closed 20–26 Oct. Classes resume 27 Oct.', 4, 1],
  ];
  for (final n in notices) {
    await _put(db, 'notices', {
      'id': n[0],
      'title': n[1],
      'body': n[2],
      'date': now.subtract(Duration(days: n[3] as int)).toIso8601String(),
      'read': n[4],
    });
  }

  final prefs = [
    ['attendance', 'Attendance alerts', 'When your child is marked absent', 'Academics', 1],
    ['results', 'Results & report cards', 'New marks and published report cards', 'Academics', 1],
    ['homework', 'Homework', 'New assignments and due reminders', 'Academics', 1],
    ['fees', 'Fee reminders', 'Upcoming and overdue invoices', 'Fees', 1],
    ['receipts', 'Payment receipts', 'Confirmation after each payment', 'Fees', 0],
    ['notices', 'School notices', 'Announcements and circulars', 'General', 1],
    ['messages', 'Messages from staff', 'Direct messages and replies', 'General', 1],
  ];
  for (final pr in prefs) {
    await _put(db, 'prefs', {
      'key': pr[0],
      'label': pr[1],
      'subtitle': pr[2],
      'grp': pr[3],
      'enabled': pr[4],
    });
  }
}

// ---- demo data for Attendance / Results / Homework / Courses -------------
Future<void> _seedAux(DatabaseExecutor db) async {
  final now = DateTime.now();

  final subjects = [
    ['s1', 'English', 78, 100, 'B+'],
    ['s2', 'Mathematics', 91, 100, 'A+'],
    ['s3', 'Science', 85, 100, 'A'],
    ['s4', 'Social Studies', 72, 100, 'B'],
    ['s5', 'Hindi', 80, 100, 'A'],
    ['s6', 'Computer', 95, 100, 'A+'],
  ];
  for (final s in subjects) {
    await _put(db, 'subjects', {
      'id': s[0], 'subject': s[1], 'marks': s[2], 'maxMarks': s[3], 'grade': s[4],
    });
  }

  final homework = [
    ['h1', 'Mathematics', 'Exercise 7.2 — fractions', 1, 0],
    ['h2', 'English', 'Read Chapter 4 & answer Q1–Q5', 2, 0],
    ['h3', 'Science', 'Draw the water cycle diagram', 3, 0],
    ['h4', 'Hindi', 'Write an essay on your favourite festival', 5, 1],
    ['h5', 'Computer', 'Practice typing — 10 minutes', -1, 1],
  ];
  for (final h in homework) {
    await _put(db, 'homework', {
      'id': h[0],
      'subject': h[1],
      'title': h[2],
      'dueDate': now.add(Duration(days: h[3] as int)).toIso8601String(),
      'done': h[4],
    });
  }

  final courses = [
    ['c1', 'Times Tables Mastery', 'Mathematics', 12, 7],
    ['c2', 'Grammar Builder', 'English', 10, 3],
    ['c3', 'Our Planet Earth', 'Science', 8, 8],
    ['c4', 'Coding for Kids', 'Computer', 15, 5],
  ];
  for (final c in courses) {
    await _put(db, 'courses', {
      'id': c[0], 'title': c[1], 'subject': c[2], 'lessons': c[3], 'lessonsDone': c[4],
    });
  }

  // Last ~24 school days of attendance (skip Sundays as holidays).
  final statuses = ['present', 'present', 'present', 'late', 'present', 'absent', 'present'];
  for (var i = 0; i < 24; i++) {
    final day = now.subtract(Duration(days: i));
    final id = '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
    final status = day.weekday == DateTime.sunday ? 'holiday' : statuses[i % statuses.length];
    await _put(db, 'attendance_days', {'id': id, 'date': day.toIso8601String(), 'status': status});
  }
}
