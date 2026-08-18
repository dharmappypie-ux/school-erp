import { hasAnyPermission } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  /** Visible when the user holds any one of these. Empty = always visible. */
  permissions: string[];
  icon: string;
  /** Match child routes too (default true). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Icons are inline SVG path data (24×24) so the shell ships no icon library.
 */
export const ICONS: Record<string, string> = {
  dashboard: "M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10 3h8v5h-8v-5z",
  students: "M12 3 1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z",
  staff: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z",
  admissions: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  attendance: "M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 18H5V9h14v12zm-8.7-2.3 5.7-5.7-1.4-1.4-4.3 4.3-1.9-1.9L7 16.4l3.3 3.3z",
  academics: "M12 3 1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9z",
  fees: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
  exams: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 5v2h10V8H7zm0 4v2h10v-2H7zm0 4v2h6v-2H7z",
  timetable: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1h-2zm3 20H5V9h14v12z",
  transport: "M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM18 11H6V6h12v5z",
  library: "M12 11.55C9.64 9.35 6.48 8 3 8v11c3.48 0 6.64 1.35 9 3.55 2.36-2.19 5.52-3.55 9-3.55V8c-3.48 0-6.64 1.35-9 3.55zM12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  hostel: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  hr: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.67 0-8 1.34-8 4v2h11v-2c0-.67.16-1.28.44-1.82C11.36 13.4 10.06 13 9 13zm7.5-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm0 1.5c-1.83 0-5.5.92-5.5 2.75V19h11v-2.75c0-1.83-3.67-2.75-5.5-2.75z",
  comms: "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM7 9h10v2H7V9zm7 5H7v-2h7v2zm3-6H7V6h10v2z",
  analytics: "M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z",
  ai: "M12 2 9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5L12 2z",
  settings:
    "M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.55-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z",
  portal: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
};

/**
 * Navigation shown to portal users (students and guardians). Kept separate
 * from the staff tree because the staff pages are school-wide: a parent must
 * never be offered a link to the full student roll or the fee ledger.
 */
export const PORTAL_NAV: NavGroup[] = [
  {
    label: "My school",
    items: [
      { label: "Overview", href: "/portal", permissions: ["portal.access"], icon: "dashboard", exact: true },
      { label: "Attendance", href: "/portal/attendance", permissions: ["portal.access"], icon: "attendance" },
      { label: "Results", href: "/portal/results", permissions: ["portal.access"], icon: "exams" },
      { label: "Fees", href: "/portal/fees", permissions: ["portal.access"], icon: "fees" },
      { label: "Homework", href: "/portal/homework", permissions: ["portal.access"], icon: "admissions" },
    ],
  },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", permissions: [], icon: "dashboard", exact: true },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Students", href: "/students", permissions: ["students.read"], icon: "students" },
      { label: "Staff", href: "/staff", permissions: ["staff.read"], icon: "staff" },
      { label: "Admissions", href: "/admissions", permissions: ["admissions.read"], icon: "admissions" },
    ],
  },
  {
    label: "Academics",
    items: [
      { label: "Classes & subjects", href: "/academics", permissions: ["academics.read"], icon: "academics" },
      { label: "Attendance", href: "/attendance", permissions: ["attendance.read"], icon: "attendance" },
      { label: "Timetable", href: "/timetable", permissions: ["timetable.read"], icon: "timetable" },
      { label: "Examinations", href: "/exams", permissions: ["exams.read", "marks.read"], icon: "exams" },
      { label: "Homework", href: "/homework", permissions: ["homework.read"], icon: "admissions" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Fees", href: "/fees", permissions: ["fees.read"], icon: "fees" },
      { label: "Expenses", href: "/expenses", permissions: ["expenses.read"], icon: "fees" },
      { label: "Payroll", href: "/payroll", permissions: ["payroll.read"], icon: "hr" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Transport", href: "/transport", permissions: ["transport.read"], icon: "transport" },
      { label: "Library", href: "/library", permissions: ["library.read"], icon: "library" },
      { label: "Hostel", href: "/hostel", permissions: ["hostel.read"], icon: "hostel" },
      { label: "Leave", href: "/leave", permissions: ["leave.read", "leave.apply"], icon: "hr" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { label: "Notices", href: "/notices", permissions: ["notices.read"], icon: "comms" },
      { label: "Messages", href: "/messages", permissions: ["messages.use"], icon: "comms" },
      { label: "Broadcasts", href: "/broadcasts", permissions: ["notifications.send"], icon: "comms" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Analytics", href: "/analytics", permissions: ["analytics.read"], icon: "analytics" },
      { label: "AI insights", href: "/insights", permissions: ["ai.insights"], icon: "ai" },
      { label: "Ask your data", href: "/ask", permissions: ["ai.query"], icon: "ai" },
      { label: "Reports", href: "/reports", permissions: ["reports.build"], icon: "analytics" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Settings", href: "/settings", permissions: ["school.read"], icon: "settings" },
      { label: "Users & roles", href: "/settings/users", permissions: ["users.read"], icon: "staff" },
      { label: "Audit log", href: "/settings/audit", permissions: ["audit.read"], icon: "exams" },
    ],
  },
];

/**
 * Trims the navigation to what this user may actually open.
 *
 * A user holding both a staff role and a portal role (a teacher whose own
 * child attends the school) sees both trees, portal first.
 */
export function visibleNavigation(
  permissions: readonly string[],
  roleKeys: readonly string[],
  /**
   * Whether this user is actually linked to a student record — as the student
   * themselves or as a guardian. An administrator holding the `*` wildcard
   * technically passes the `portal.access` check but has no child to show, so
   * the portal tree would lead them to an empty state.
   */
  hasPortalRecord = false,
): NavGroup[] {
  const isStaffUser = roleKeys.some(
    (key) => key !== "STUDENT" && key !== "PARENT",
  );

  const groups: NavGroup[] = [];

  if (hasPortalRecord && hasAnyPermission(permissions, ["portal.access"])) {
    groups.push(...PORTAL_NAV);
  }

  if (isStaffUser) {
    groups.push(
      ...NAV_GROUPS.map((group) => ({
        label: group.label,
        items: group.items.filter((item) =>
          item.permissions.length === 0
            ? true
            : hasAnyPermission(permissions, item.permissions),
        ),
      })),
    );
  }

  return groups.filter((group) => group.items.length > 0);
}
