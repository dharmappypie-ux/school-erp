import {
  ReportBuilder,
  type SavedReportSummary,
} from "@/app/(app)/reports/report-builder";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { SOURCES } from "@/lib/reports";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const session = await requirePermission("reports.build");
  const db = scopedDb(session.schoolId);

  // Only offer sources the caller could already open elsewhere — the builder
  // must not become a side door to data the app otherwise withholds.
  const allowedSources = SOURCES.filter((source) =>
    hasPermission(session.permissions, source.permission),
  ).map((source) => source.key);

  const reports = await db.savedReport.findMany({
    where: {
      OR: [{ ownerId: session.userId }, { isShared: true }],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 30,
    select: {
      id: true,
      name: true,
      description: true,
      isShared: true,
      ownerId: true,
      owner: { select: { firstName: true, lastName: true } },
    },
  });

  const saved: SavedReportSummary[] = reports.map((report) => ({
    id: report.id,
    name: report.name,
    description: report.description,
    isShared: report.isShared,
    ownedByMe: report.ownerId === session.userId,
    ownerName: report.owner
      ? `${report.owner.firstName} ${report.owner.lastName ?? ""}`.trim()
      : null,
  }));

  return (
    <>
      <PageHeader
        title="Reports"
        description="Build, save and export reports across the school's data."
      />
      <ReportBuilder allowedSources={allowedSources} saved={saved} />
      <p className="mt-3 text-xs text-muted">
        Reports can only use predefined sources, fields and operators, and are
        always limited to your school. A report reaching the row limit says so,
        rather than presenting a partial answer as complete.
      </p>
    </>
  );
}
