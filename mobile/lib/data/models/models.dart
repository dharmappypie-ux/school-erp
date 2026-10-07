// Plain data models with sqflite map (de)serialisation. Kept dependency-free
// so the local database, the API client and the UI all speak the same shapes.

/// Which experience the signed-in user sees. The backend has many role values
/// (ADMIN, TEACHER, STUDENT, GUARDIAN, PLATFORM_ADMIN…); they collapse to the
/// three app experiences below.
enum UserRole {
  parent, // guardian / student companion
  teacher, // class teacher tools
  admin; // school administration

  String get label => switch (this) {
        UserRole.parent => 'Parent',
        UserRole.teacher => 'Teacher',
        UserRole.admin => 'Admin',
      };

  /// Map a backend role string onto an app experience.
  static UserRole fromServer(String? role) {
    final r = (role ?? '').toUpperCase();
    if (r.contains('ADMIN') || r.contains('PRINCIPAL') || r.contains('OWNER')) {
      return UserRole.admin;
    }
    if (r.contains('TEACHER') || r.contains('STAFF') || r.contains('FACULTY')) {
      return UserRole.teacher;
    }
    return UserRole.parent;
  }

  static UserRole fromName(String? name) =>
      UserRole.values.firstWhere((e) => e.name == name, orElse: () => UserRole.parent);
}

/// The signed-in user (returned by the mobile login endpoint).
class AppUser {
  final String id;
  final String name;
  final String email;
  final UserRole role;
  final String? schoolName;

  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.schoolName,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: (j['id'] ?? '').toString(),
        name: (j['name'] ?? j['fullName'] ?? 'User').toString(),
        email: (j['email'] ?? '').toString(),
        role: UserRole.fromServer(j['role']?.toString()),
        schoolName: j['schoolName']?.toString() ?? j['school']?.toString(),
      );
}

class Student {
  final String id;
  final String name;
  final String admissionNo;
  final String className;
  final double feeBalance;
  final int attendancePercent;
  final int avgPercent;

  /// Last-7-terms (or days) trend used by the home sparkline.
  final List<double> trend;

  const Student({
    required this.id,
    required this.name,
    required this.admissionNo,
    required this.className,
    required this.feeBalance,
    required this.attendancePercent,
    required this.avgPercent,
    this.trend = const [],
  });

  Map<String, Object?> toMap() => {
        'id': id,
        'name': name,
        'admissionNo': admissionNo,
        'className': className,
        'feeBalance': feeBalance,
        'attendancePercent': attendancePercent,
        'avgPercent': avgPercent,
        'trend': trend.join(','),
      };

  factory Student.fromMap(Map<String, Object?> m) => Student(
        id: m['id'] as String,
        name: m['name'] as String,
        admissionNo: m['admissionNo'] as String,
        className: m['className'] as String,
        feeBalance: (m['feeBalance'] as num).toDouble(),
        attendancePercent: (m['attendancePercent'] as num).toInt(),
        avgPercent: (m['avgPercent'] as num).toInt(),
        trend: (m['trend'] as String? ?? '')
            .split(',')
            .where((s) => s.isNotEmpty)
            .map(double.parse)
            .toList(),
      );
}

enum InvoiceStatus { paid, due, overdue }

class FeeInvoice {
  final String id;
  final String title;
  final double amount;
  final double paid;
  final DateTime dueDate;
  final InvoiceStatus status;

  const FeeInvoice({
    required this.id,
    required this.title,
    required this.amount,
    required this.paid,
    required this.dueDate,
    required this.status,
  });

  double get balance => (amount - paid).clamp(0, amount);

  Map<String, Object?> toMap() => {
        'id': id,
        'title': title,
        'amount': amount,
        'paid': paid,
        'dueDate': dueDate.toIso8601String(),
        'status': status.name,
      };

  factory FeeInvoice.fromMap(Map<String, Object?> m) => FeeInvoice(
        id: m['id'] as String,
        title: m['title'] as String,
        amount: (m['amount'] as num).toDouble(),
        paid: (m['paid'] as num).toDouble(),
        dueDate: DateTime.parse(m['dueDate'] as String),
        status: InvoiceStatus.values.byName(m['status'] as String),
      );
}

class AppNotice {
  final String id;
  final String title;
  final String body;
  final DateTime date;
  final bool read;

  const AppNotice({
    required this.id,
    required this.title,
    required this.body,
    required this.date,
    required this.read,
  });

  Map<String, Object?> toMap() => {
        'id': id,
        'title': title,
        'body': body,
        'date': date.toIso8601String(),
        'read': read ? 1 : 0,
      };

  factory AppNotice.fromMap(Map<String, Object?> m) => AppNotice(
        id: m['id'] as String,
        title: m['title'] as String,
        body: m['body'] as String,
        date: DateTime.parse(m['date'] as String),
        read: (m['read'] as int) == 1,
      );
}

/// A notification toggle (the "Notifications 6 of 7" screen in the reference).
class Pref {
  final String key;
  final String label;
  final String subtitle;
  final String group;
  final bool enabled;

  const Pref({
    required this.key,
    required this.label,
    required this.subtitle,
    required this.group,
    required this.enabled,
  });

  Pref copyWith({bool? enabled}) => Pref(
        key: key,
        label: label,
        subtitle: subtitle,
        group: group,
        enabled: enabled ?? this.enabled,
      );

  Map<String, Object?> toMap() => {
        'key': key,
        'label': label,
        'subtitle': subtitle,
        'group': group,
        'enabled': enabled ? 1 : 0,
      };

  factory Pref.fromMap(Map<String, Object?> m) => Pref(
        key: m['key'] as String,
        label: m['label'] as String,
        subtitle: m['subtitle'] as String,
        group: m['group'] as String,
        enabled: (m['enabled'] as int) == 1,
      );
}

/// A subject's result for the current term (the Results screen).
class SubjectResult {
  final String id;
  final String subject;
  final int marks;
  final int maxMarks;
  final String grade;

  const SubjectResult({
    required this.id,
    required this.subject,
    required this.marks,
    required this.maxMarks,
    required this.grade,
  });

  double get fraction => maxMarks == 0 ? 0 : marks / maxMarks;

  Map<String, Object?> toMap() => {
        'id': id,
        'subject': subject,
        'marks': marks,
        'maxMarks': maxMarks,
        'grade': grade,
      };

  factory SubjectResult.fromMap(Map<String, Object?> m) => SubjectResult(
        id: m['id'] as String,
        subject: m['subject'] as String,
        marks: (m['marks'] as num).toInt(),
        maxMarks: (m['maxMarks'] as num).toInt(),
        grade: m['grade'] as String,
      );
}

/// A homework assignment (the Homework screen). `done` is a device-local flag
/// queued to the server via the outbox.
class HomeworkItem {
  final String id;
  final String subject;
  final String title;
  final DateTime dueDate;
  final bool done;

  const HomeworkItem({
    required this.id,
    required this.subject,
    required this.title,
    required this.dueDate,
    required this.done,
  });

  Map<String, Object?> toMap() => {
        'id': id,
        'subject': subject,
        'title': title,
        'dueDate': dueDate.toIso8601String(),
        'done': done ? 1 : 0,
      };

  factory HomeworkItem.fromMap(Map<String, Object?> m) => HomeworkItem(
        id: m['id'] as String,
        subject: m['subject'] as String,
        title: m['title'] as String,
        dueDate: DateTime.parse(m['dueDate'] as String),
        done: (m['done'] as int) == 1,
      );
}

/// A course / lesson track with progress (the Courses & quizzes screen).
class CourseItem {
  final String id;
  final String title;
  final String subject;
  final int lessons;
  final int lessonsDone;

  const CourseItem({
    required this.id,
    required this.title,
    required this.subject,
    required this.lessons,
    required this.lessonsDone,
  });

  double get progress => lessons == 0 ? 0 : lessonsDone / lessons;

  Map<String, Object?> toMap() => {
        'id': id,
        'title': title,
        'subject': subject,
        'lessons': lessons,
        'lessonsDone': lessonsDone,
      };

  factory CourseItem.fromMap(Map<String, Object?> m) => CourseItem(
        id: m['id'] as String,
        title: m['title'] as String,
        subject: m['subject'] as String,
        lessons: (m['lessons'] as num).toInt(),
        lessonsDone: (m['lessonsDone'] as num).toInt(),
      );
}

enum AttendanceStatus { present, absent, late, holiday }

/// One day on the attendance register (the Attendance screen).
class AttendanceDay {
  final String id; // yyyy-mm-dd
  final DateTime date;
  final AttendanceStatus status;

  const AttendanceDay({required this.id, required this.date, required this.status});

  Map<String, Object?> toMap() => {
        'id': id,
        'date': date.toIso8601String(),
        'status': status.name,
      };

  factory AttendanceDay.fromMap(Map<String, Object?> m) => AttendanceDay(
        id: m['id'] as String,
        date: DateTime.parse(m['date'] as String),
        status: AttendanceStatus.values.byName(m['status'] as String),
      );
}

/// A pending local change waiting to be pushed to the server on the next sync.
class OutboxItem {
  final int? id;
  final String kind; // e.g. "pref.toggle", "notice.read"
  final String entityId;
  final String payload; // JSON
  final DateTime createdAt;

  const OutboxItem({
    this.id,
    required this.kind,
    required this.entityId,
    required this.payload,
    required this.createdAt,
  });

  Map<String, Object?> toMap() => {
        if (id != null) 'id': id,
        'kind': kind,
        'entityId': entityId,
        'payload': payload,
        'createdAt': createdAt.toIso8601String(),
      };

  factory OutboxItem.fromMap(Map<String, Object?> m) => OutboxItem(
        id: m['id'] as int?,
        kind: m['kind'] as String,
        entityId: m['entityId'] as String,
        payload: m['payload'] as String,
        createdAt: DateTime.parse(m['createdAt'] as String),
      );
}
