/**
 * Permission catalogue and the default role presets seeded for every school.
 *
 * Keys are `<module>.<action>`. The wildcard `"*"` grants everything; a
 * module-level wildcard such as `"fees.*"` grants every action in that module.
 */

export const PERMISSIONS = {
  // Tenant administration
  "school.read": "View school profile",
  "school.update": "Edit school profile and branding",
  "school.settings": "Manage modules, settings and feature flags",
  "users.read": "View users",
  "users.create": "Create users",
  "users.update": "Edit users",
  "users.delete": "Deactivate users",
  "roles.manage": "Create and edit roles and permissions",
  "audit.read": "View the audit trail",

  // Academic structure
  "academics.read": "View classes, sections and subjects",
  "academics.manage": "Create and edit classes, sections and subjects",
  "academicyear.manage": "Create, switch and lock academic years",

  // Students
  "students.read": "View student records",
  "students.create": "Add students",
  "students.update": "Edit student records",
  "students.delete": "Archive students",
  "students.export": "Export student data",
  "students.promote": "Promote students between years",

  // Guardians
  "guardians.read": "View guardian records",
  "guardians.manage": "Add and edit guardians",

  // Staff & HR
  "staff.read": "View staff records",
  "staff.create": "Add staff",
  "staff.update": "Edit staff records",
  "staff.delete": "Archive staff",
  "leave.read": "View leave requests",
  "leave.apply": "Apply for leave",
  "leave.approve": "Approve or reject leave",
  "payroll.read": "View payroll and payslips",
  "payroll.manage": "Run payroll and edit salary structures",

  // Admissions
  "admissions.read": "View applications",
  "admissions.manage": "Process and decide on applications",
  "admissions.apply": "Submit an application",

  // Attendance
  "attendance.read": "View attendance",
  "attendance.mark": "Mark and edit attendance",
  "attendance.report": "View attendance analytics",

  // Fees & accounting
  "fees.read": "View fee structures and invoices",
  "fees.manage": "Create fee structures and concessions",
  "fees.invoice": "Generate and cancel invoices",
  "fees.collect": "Record payments and issue receipts",
  "fees.refund": "Process refunds",
  "fees.report": "View collection and defaulter reports",
  "expenses.read": "View expenses",
  "expenses.manage": "Record and approve expenses",

  // Exams
  "exams.read": "View exams and schedules",
  "exams.manage": "Create exams, terms and grading schemes",
  "marks.enter": "Enter and edit marks",
  "marks.read": "View marks",
  "reportcards.generate": "Generate report cards",
  "reportcards.publish": "Publish report cards to parents",
  "reportcards.read": "View report cards",

  // Timetable
  "timetable.read": "View timetables",
  "timetable.manage": "Create timetables and substitutions",

  // Transport
  "transport.read": "View routes, vehicles and assignments",
  "transport.manage": "Manage routes, vehicles and assignments",
  "transport.track": "View live vehicle tracking",

  // Library
  "library.read": "Browse the catalogue",
  "library.manage": "Manage books and copies",
  "library.circulate": "Issue and return books",

  // Hostel
  "hostel.read": "View hostels and allocations",
  "hostel.manage": "Manage hostels, rooms and allocations",

  // Communication
  "notices.read": "View notices",
  "notices.manage": "Publish notices",
  "messages.use": "Send and read direct messages",
  "notifications.send": "Send SMS, WhatsApp and email broadcasts",
  "homework.read": "View homework",
  "homework.manage": "Assign and grade homework",
  "homework.submit": "Submit homework",

  // Portal — student and guardian self-service.
  // Deliberately separate from the staff permissions above: a parent must not
  // hold `students.read`, which grants the whole roll. Portal pages authorise
  // by relationship (which children are mine) rather than by permission.
  "portal.access": "Use the student and parent portal",

  // AI & analytics
  "analytics.read": "View dashboards and analytics",
  "reports.build": "Create and share custom reports",
  "ai.insights": "View AI insights and risk scores",
  "ai.query": "Ask natural-language questions about school data",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

function moduleActions(moduleName: string): PermissionKey[] {
  return ALL_PERMISSIONS.filter((key) => key.startsWith(`${moduleName}.`));
}

/**
 * Does `granted` satisfy `required`? Supports `"*"` and `"module.*"`.
 */
export function hasPermission(
  granted: readonly string[],
  required: PermissionKey | string,
): boolean {
  if (granted.includes("*")) return true;
  if (granted.includes(required)) return true;
  const moduleName = required.split(".")[0];
  return granted.includes(`${moduleName}.*`);
}

export function hasAnyPermission(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  return required.some((key) => hasPermission(granted, key));
}

export type RoleKey =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "PRINCIPAL"
  | "TEACHER"
  | "ACCOUNTANT"
  | "LIBRARIAN"
  | "TRANSPORT_MANAGER"
  | "HOSTEL_WARDEN"
  | "RECEPTIONIST"
  | "STUDENT"
  | "PARENT";

export interface RolePreset {
  key: RoleKey;
  name: string;
  description: string;
  permissions: string[];
  /** Landing route after login. */
  home: string;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    key: "SUPER_ADMIN",
    name: "Super Administrator",
    description: "Unrestricted access across the entire school.",
    permissions: ["*"],
    home: "/dashboard",
  },
  {
    key: "ADMIN",
    name: "School Administrator",
    description: "Day-to-day administration of every module.",
    permissions: [
      "school.read",
      "school.update",
      "school.settings",
      "users.read",
      "users.create",
      "users.update",
      "users.delete",
      "roles.manage",
      "audit.read",
      ...moduleActions("academics"),
      "academicyear.manage",
      ...moduleActions("students"),
      ...moduleActions("guardians"),
      ...moduleActions("staff"),
      ...moduleActions("leave"),
      ...moduleActions("payroll"),
      ...moduleActions("admissions"),
      ...moduleActions("attendance"),
      ...moduleActions("fees"),
      ...moduleActions("expenses"),
      ...moduleActions("exams"),
      ...moduleActions("marks"),
      ...moduleActions("reportcards"),
      ...moduleActions("timetable"),
      ...moduleActions("transport"),
      ...moduleActions("library"),
      ...moduleActions("hostel"),
      ...moduleActions("notices"),
      ...moduleActions("messages"),
      ...moduleActions("notifications"),
      ...moduleActions("homework"),
      ...moduleActions("analytics"),
      ...moduleActions("reports"),
      ...moduleActions("ai"),
    ],
    home: "/dashboard",
  },
  {
    key: "PRINCIPAL",
    name: "Principal",
    description: "Oversight of academics, staff and analytics.",
    permissions: [
      "school.read",
      "users.read",
      "audit.read",
      "academics.read",
      "academics.manage",
      "academicyear.manage",
      "students.read",
      "students.export",
      "students.promote",
      "guardians.read",
      "staff.read",
      "staff.update",
      "leave.read",
      "leave.approve",
      "payroll.read",
      "admissions.read",
      "admissions.manage",
      "attendance.read",
      "attendance.report",
      "fees.read",
      "fees.report",
      "expenses.read",
      "exams.read",
      "exams.manage",
      "marks.read",
      "reportcards.generate",
      "reportcards.publish",
      "reportcards.read",
      "timetable.read",
      "timetable.manage",
      "transport.read",
      "transport.track",
      "library.read",
      "hostel.read",
      "notices.read",
      "notices.manage",
      "messages.use",
      "notifications.send",
      "homework.read",
      "analytics.read",
      "reports.build",
      "ai.insights",
      "ai.query",
    ],
    home: "/dashboard",
  },
  {
    key: "TEACHER",
    name: "Teacher",
    description: "Class teaching, attendance, marks and homework.",
    permissions: [
      "academics.read",
      "students.read",
      "guardians.read",
      "leave.apply",
      "leave.read",
      "attendance.read",
      "attendance.mark",
      "attendance.report",
      "exams.read",
      "marks.read",
      "marks.enter",
      "reportcards.read",
      "reportcards.generate",
      "timetable.read",
      "notices.read",
      "messages.use",
      "homework.read",
      "homework.manage",
      "library.read",
      "analytics.read",
      "ai.insights",
    ],
    home: "/dashboard",
  },
  {
    key: "ACCOUNTANT",
    name: "Accountant",
    description: "Fee collection, invoicing and expense management.",
    permissions: [
      "students.read",
      "guardians.read",
      "academics.read",
      ...moduleActions("fees"),
      ...moduleActions("expenses"),
      "payroll.read",
      "payroll.manage",
      "notices.read",
      "messages.use",
      "notifications.send",
      "analytics.read",
      "reports.build",
    ],
    home: "/fees",
  },
  {
    key: "LIBRARIAN",
    name: "Librarian",
    description: "Catalogue and circulation management.",
    permissions: [
      "students.read",
      "staff.read",
      "academics.read",
      ...moduleActions("library"),
      "notices.read",
      "messages.use",
    ],
    home: "/library",
  },
  {
    key: "TRANSPORT_MANAGER",
    name: "Transport Manager",
    description: "Fleet, routes and student transport assignments.",
    permissions: [
      "students.read",
      "guardians.read",
      ...moduleActions("transport"),
      "notices.read",
      "messages.use",
      "notifications.send",
    ],
    home: "/transport",
  },
  {
    key: "HOSTEL_WARDEN",
    name: "Hostel Warden",
    description: "Hostel rooms, allocations and resident welfare.",
    permissions: [
      "students.read",
      "guardians.read",
      ...moduleActions("hostel"),
      "attendance.read",
      "notices.read",
      "messages.use",
      "notifications.send",
    ],
    home: "/hostel",
  },
  {
    key: "RECEPTIONIST",
    name: "Front Desk",
    description: "Enquiries, admissions intake and visitor handling.",
    permissions: [
      "students.read",
      "guardians.read",
      "guardians.manage",
      "academics.read",
      "admissions.read",
      "admissions.manage",
      "attendance.read",
      "fees.read",
      "notices.read",
      "messages.use",
    ],
    home: "/admissions",
  },
  // Portal roles hold `portal.access` and little else. Granting them the staff
  // read permissions (`students.read`, `reportcards.read`, …) would expose the
  // entire school roll, so those are deliberately absent — the portal scopes
  // every query to the viewer's own children instead.
  {
    key: "STUDENT",
    name: "Student",
    description: "Self-service portal for the logged-in student.",
    permissions: ["portal.access", "messages.use", "homework.submit", "leave.apply"],
    home: "/portal",
  },
  {
    key: "PARENT",
    name: "Parent / Guardian",
    description: "Portal covering the guardian's own children only.",
    permissions: ["portal.access", "messages.use", "admissions.apply", "homework.submit"],
    home: "/portal",
  },
];

export const ROLE_PRESET_BY_KEY = new Map<string, RolePreset>(
  ROLE_PRESETS.map((preset) => [preset.key, preset]),
);

/**
 * Where a user lands after login, given all the roles they hold.
 * Staff-facing roles win over portal roles when a user has both.
 */
export function resolveHomeRoute(roleKeys: readonly string[]): string {
  for (const preset of ROLE_PRESETS) {
    if (roleKeys.includes(preset.key)) return preset.home;
  }
  return "/dashboard";
}
