import {
  markGuardianNotified,
  retractBehaviourLog,
} from "@/app/(app)/behaviour/actions";
import { BehaviourForm } from "@/app/(app)/behaviour/behaviour-form";
import { DrawerForm } from "@/components/drawer-form";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  type Tone,
} from "@/components/ui";
import { requireAnyPermission } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Behaviour" };

const KIND_TONE: Record<string, Tone> = {
  APPRECIATION: "success",
  CONCERN: "danger",
  NEUTRAL: "neutral",
};

const KIND_LABEL: Record<string, string> = {
  APPRECIATION: "Appreciation",
  CONCERN: "Concern",
  NEUTRAL: "Note",
};

export default async function BehaviourPage() {
  const session = await requireAnyPermission([
    "behaviour.read",
    "behaviour.manage",
  ]);
  const db = scopedDb(session.schoolId);
  const canManage = hasPermission(session.permissions, "behaviour.manage");
  const yearId = session.academicYear?.id;

  const [logs, students] = await Promise.all([
    db.behaviourLog.findMany({
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
          },
        },
        recordedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    canManage
      ? db.student.findMany({
          where: {
            deletedAt: null,
            status: "ACTIVE",
            ...(yearId
              ? { enrollments: { some: { academicYearId: yearId } } }
              : {}),
          },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          take: 2000,
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            enrollments: {
              where: yearId ? { academicYearId: yearId } : undefined,
              take: 1,
              select: {
                section: {
                  select: {
                    name: true,
                    classLevel: { select: { name: true, numericOrder: true } },
                  },
                },
              },
            },
            // Father where there is one, else whoever is primary — this is the
            // line that tells two students of the same name apart.
            guardians: {
              orderBy: [{ isPrimary: "desc" }],
              select: {
                relationship: true,
                guardian: { select: { firstName: true, lastName: true } },
              },
            },
          },
        })
      : [],
  ]);

  const live = logs.filter((log) => log.retractedAt === null);
  const appreciations = live.filter((log) => log.kind === "APPRECIATION");
  const concerns = live.filter((log) => log.kind === "CONCERN");
  // A medium or high concern the guardian has not been told about is the one
  // thing on this page that needs action today.
  const awaitingGuardian = concerns.filter(
    (log) => log.severity !== "LOW" && log.guardianNotifiedAt === null,
  );

  // Sorted by class, then section, then name, so the picker's class dropdown
  // reads I A, I B, II A … Prisma cannot order a to-many relation's field, so
  // the ordering is done here rather than in the query.
  const studentOptions = students
    .map((student) => {
      const father = student.guardians.find(
        (link) => link.relationship === "FATHER",
      );
      const contact = father ?? student.guardians[0];
      const section = student.enrollments[0]?.section;
      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName ?? ""}`.trim(),
        admissionNo: student.admissionNo,
        classLevel: section?.classLevel.name ?? "",
        section: section?.name ?? "",
        guardianName: contact
          ? `${contact.guardian.firstName} ${contact.guardian.lastName ?? ""}`.trim()
          : "",
        sortKey: section
          ? [
              String(section.classLevel.numericOrder).padStart(4, "0"),
              section.name,
            ].join("-")
          : // Unenrolled students sort last rather than first.
            "zzzz",
      };
    })
    .sort(
      (left, right) =>
        left.sortKey.localeCompare(right.sortKey) ||
        left.name.localeCompare(right.name),
    );

  return (
    <>
      <PageHeader
        title="Behaviour"
        description="Praise and concerns recorded against students, newest first."
        action={
          canManage ? (
            <DrawerForm
              trigger="Record note"
              title="Record a behaviour note"
              description="Appreciation counts as much as a concern"
              width="w-[32rem]"
            >
              <BehaviourForm bare students={studentOptions} />
            </DrawerForm>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Appreciations"
          value={String(appreciations.length)}
          sublabel="last 100 notes"
          tone="success"
        />
        <StatTile
          label="Concerns"
          value={String(concerns.length)}
          sublabel="last 100 notes"
          tone={concerns.length > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Guardian not told"
          value={String(awaitingGuardian.length)}
          sublabel={
            awaitingGuardian.length > 0 ? "medium or high" : "nothing waiting"
          }
          tone={awaitingGuardian.length > 0 ? "danger" : "success"}
        />
        <StatTile
          label="Balance"
          value={
            concerns.length === 0
              ? appreciations.length > 0
                ? "All positive"
                : "—"
              : `${(appreciations.length / Math.max(concerns.length, 1)).toFixed(1)}:1`
          }
          sublabel="praise per concern"
          tone={appreciations.length >= concerns.length ? "success" : "warning"}
        />
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Behaviour ledger"
            description="Retracted notes stay visible, struck through, so the record is honest"
          />
          {logs.length === 0 ? (
            <EmptyState
              title="Nothing recorded yet"
              description={
                canManage
                  ? "Use “Record note” to log the first one — praise is worth logging too."
                  : "No behaviour notes have been written."
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {logs.map((log) => {
                const retracted = log.retractedAt !== null;
                return (
                  <li key={log.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={retracted ? "neutral" : KIND_TONE[log.kind]}
                          >
                            {KIND_LABEL[log.kind]}
                          </Badge>
                          {log.kind === "CONCERN" && log.severity !== "LOW" ? (
                            <Badge
                              tone={
                                log.severity === "HIGH" ? "danger" : "warning"
                              }
                            >
                              {log.severity === "HIGH" ? "High" : "Medium"}
                            </Badge>
                          ) : null}
                          {log.category ? (
                            <Badge tone="info">{log.category}</Badge>
                          ) : null}
                          {retracted ? (
                            <Badge tone="neutral">Retracted</Badge>
                          ) : null}
                        </div>

                        <p
                          className={`mt-1.5 text-sm font-semibold ${
                            retracted ? "text-muted line-through" : ""
                          }`}
                        >
                          {log.summary}
                        </p>

                        {log.detail ? (
                          <p className="mt-1 text-[13px] leading-relaxed text-muted-strong">
                            {log.detail}
                          </p>
                        ) : null}

                        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <a
                            href={`/students/${log.student.id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {log.student.firstName} {log.student.lastName ?? ""}
                          </a>
                          <span>·</span>
                          <span>{log.student.admissionNo}</span>
                          <span>·</span>
                          <span>{formatDate(log.occurredOn)}</span>
                          {log.recordedBy ? (
                            <>
                              <span>·</span>
                              <span>
                                {log.recordedBy.firstName}{" "}
                                {log.recordedBy.lastName ?? ""}
                              </span>
                            </>
                          ) : null}
                          {log.guardianNotifiedAt ? (
                            <>
                              <span>·</span>
                              <span>
                                guardian told{" "}
                                {formatDate(log.guardianNotifiedAt)}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>

                      {canManage && !retracted ? (
                        <div className="flex shrink-0 gap-2">
                          {log.guardianNotifiedAt === null ? (
                            <form action={markGuardianNotified}>
                              <input type="hidden" name="id" value={log.id} />
                              <Button type="submit" variant="secondary">
                                Guardian told
                              </Button>
                            </form>
                          ) : null}
                          <form action={retractBehaviourLog}>
                            <input type="hidden" name="id" value={log.id} />
                            <Button type="submit" variant="secondary">
                              Retract
                            </Button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
