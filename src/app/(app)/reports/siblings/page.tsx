import Link from "next/link";

import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  Table,
  Td,
  Th,
} from "@/components/ui";
import type { SiblingRelation } from "@/generated/prisma/enums";
import { requireAnyPermission } from "@/lib/auth";
import { formatDateOnly, titleCase } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Sibling report" };

const RELATION_LABEL: Record<SiblingRelation, string> = {
  BROTHER: "Brother",
  SISTER: "Sister",
  OTHER: "Sibling",
};

/**
 * A guardian attached to more children than this is a shared placeholder row
 * ("Guardian", "N/A", a hostel warden) rather than a parent. Treating one as a
 * family would collapse half the roll into a single household and quietly
 * wreck every concession decision taken off this report, so those guardians
 * are excluded from the inferred signal and reported for cleaning instead.
 * Explicit sibling records on the same students still count.
 */
const IMPLAUSIBLE_GUARDIAN_CHILDREN = 8;

function studentName(student: {
  firstName: string;
  lastName: string | null;
}): string {
  return `${student.firstName} ${student.lastName ?? ""}`.trim();
}

export default async function SiblingReportPage() {
  const session = await requireAnyPermission(["students.read"]);
  const db = scopedDb(session.schoolId);
  // The prospective card shows applicant names, application numbers and links into
  // /admissions. students.read alone does not earn that — a librarian or accountant
  // holds it and would otherwise read every live applicant, then be bounced to
  // /forbidden on the link. Gate that half, not the whole page.
  const canSeeAdmissions = hasPermission(
    session.permissions,
    "admissions.read",
  );
  const yearId = session.academicYear?.id;

  const [roll, prospective] = await Promise.all([
    // Guardians and explicit sibling links come back on the roll query itself:
    // the families are a graph over these students, and a second round trip
    // per signal would only have to be stitched back onto the same rows.
    db.student.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
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
        guardians: {
          select: {
            isPrimary: true,
            relationship: true,
            guardian: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
        siblings: {
          where: { siblingStudentId: { not: null } },
          select: { siblingStudentId: true },
        },
      },
    }),
    !canSeeAdmissions
      ? []
      : db.studentSibling.findMany({
          where: {
            siblingStudentId: null,
            schoolName: { not: null },
            // A sibling named by a child who has since left is not a prospect.
            // The second branch must mean "still only an application", not "has an
            // applicationId" — enrolment deliberately keeps applicationId when it sets
            // studentId, so the looser test rescued every enrolled row and this guard
            // never fired for the admissions path, which is most of them.
            OR: [
              { student: { is: { deletedAt: null, status: "ACTIVE" } } },
              { AND: [{ studentId: null }, { applicationId: { not: null } }] },
            ],
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            relation: true,
            dateOfBirth: true,
            schoolName: true,
            notes: true,
            student: {
              select: {
                id: true,
                admissionNo: true,
                firstName: true,
                lastName: true,
              },
            },
            application: {
              select: {
                id: true,
                applicationNo: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        }),
  ]);

  type RollStudent = (typeof roll)[number];
  type GuardianRow = RollStudent["guardians"][number]["guardian"];

  const onRoll = new Set(roll.map((student) => student.id));

  // Union-find over the two signals. Merging in one structure is what stops a
  // family that an explicit record AND a shared guardian both describe from
  // being counted, and printed, twice.
  const parent = new Map<string, string>(
    roll.map((student): [string, string] => [student.id, student.id]),
  );

  function find(id: string): string {
    let root = id;
    for (;;) {
      const next = parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) ?? root;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  function union(left: string, right: string): void {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent.set(rootLeft, rootRight);
  }

  const explicitPairs: [string, string][] = [];
  for (const student of roll) {
    for (const link of student.siblings) {
      const other = link.siblingStudentId;
      // The link survives the sibling leaving (onDelete: SetNull only fires on
      // a hard delete), so a pointer off today's roll is not a family here.
      if (!other || !onRoll.has(other)) continue;
      explicitPairs.push([student.id, other]);
    }
  }

  const byGuardian = new Map<
    string,
    { guardian: GuardianRow; studentIds: string[] }
  >();
  for (const student of roll) {
    for (const link of student.guardians) {
      const entry = byGuardian.get(link.guardian.id);
      if (entry) entry.studentIds.push(student.id);
      else {
        byGuardian.set(link.guardian.id, {
          guardian: link.guardian,
          studentIds: [student.id],
        });
      }
    }
  }

  const overloadedGuardians = Array.from(byGuardian.values()).filter(
    (entry) => entry.studentIds.length > IMPLAUSIBLE_GUARDIAN_CHILDREN,
  );
  // The same placeholder rows are skipped when grouping, so they must be skipped
  // when choosing the family's contact too — otherwise the page warns that a record
  // is a placeholder and then prints it as the family's name and phone.
  const overloadedIds = new Set(
    overloadedGuardians.map((entry) => entry.guardian.id),
  );
  const overloadedNames = overloadedGuardians
    .map(
      (entry) =>
        `${`${entry.guardian.firstName} ${entry.guardian.lastName ?? ""}`.trim()} (${entry.studentIds.length} children)`,
    )
    .join("; ");

  for (const [left, right] of explicitPairs) union(left, right);
  for (const entry of byGuardian.values()) {
    if (entry.studentIds.length > IMPLAUSIBLE_GUARDIAN_CHILDREN) continue;
    for (let index = 1; index < entry.studentIds.length; index += 1) {
      union(entry.studentIds[0], entry.studentIds[index]);
    }
  }

  // Resolved only after every union: a pair's root moves as the family grows.
  const rootsWithSiblingRecord = new Set(
    explicitPairs.map(([left]) => find(left)),
  );

  const groups = new Map<string, RollStudent[]>();
  for (const student of roll) {
    const root = find(student.id);
    const members = groups.get(root);
    if (members) members.push(student);
    else groups.set(root, [student]);
  }

  const families = Array.from(groups.entries())
    .filter(([, members]) => members.length > 1)
    .map(([root, members]) => {
      const tally = new Map<
        string,
        {
          guardian: GuardianRow;
          relationship: string;
          children: number;
          isPrimary: boolean;
        }
      >();
      for (const student of members) {
        for (const link of student.guardians) {
          if (overloadedIds.has(link.guardian.id)) continue;
          const entry = tally.get(link.guardian.id);
          if (entry) {
            entry.children += 1;
            entry.isPrimary = entry.isPrimary || link.isPrimary;
          } else {
            tally.set(link.guardian.id, {
              guardian: link.guardian,
              relationship: link.relationship,
              children: 1,
              isPrimary: link.isPrimary,
            });
          }
        }
      }

      // The guardian shared by the most children is the household contact; one
      // attached to a single child identifies that child, not the family.
      const contact =
        Array.from(tally.values()).sort(
          (left, right) =>
            right.children - left.children ||
            Number(right.isPrimary) - Number(left.isPrimary) ||
            left.guardian.firstName.localeCompare(right.guardian.firstName),
        )[0] ?? null;

      const children = members
        .map((student) => {
          const section = student.enrollments[0]?.section;
          return {
            id: student.id,
            name: studentName(student),
            admissionNo: student.admissionNo,
            classSection: section
              ? `${section.classLevel.name} ${section.name}`
              : "Not enrolled",
            // Unenrolled children sort after the enrolled ones.
            order: section
              ? section.classLevel.numericOrder
              : Number.MAX_SAFE_INTEGER,
          };
        })
        .sort(
          (left, right) =>
            left.order - right.order || left.name.localeCompare(right.name),
        );

      return {
        id: root,
        children,
        contactName: contact
          ? `${contact.guardian.firstName} ${contact.guardian.lastName ?? ""}`.trim()
          : null,
        contactPhone: contact?.guardian.phone ?? null,
        contactRelationship: contact ? titleCase(contact.relationship) : null,
        fromSiblingRecord: rootsWithSiblingRecord.has(root),
      };
    })
    .sort(
      (left, right) =>
        right.children.length - left.children.length ||
        (left.contactName ?? "").localeCompare(right.contactName ?? "") ||
        left.children[0].name.localeCompare(right.children[0].name),
    );

  const totalChildren = families.reduce(
    (sum, family) => sum + family.children.length,
    0,
  );
  const recordedFamilies = families.filter(
    (family) => family.fromSiblingRecord,
  ).length;
  const inferredFamilies = families.length - recordedFamilies;

  return (
    <>
      <PageHeader
        title="Siblings"
        description="Families with more than one child on the roll — the basis for sibling concessions, shared transport and section placement."
      />

      {overloadedGuardians.length > 0 ? (
        <div className="mb-4">
          <Alert
            tone="warning"
            title={`${overloadedGuardians.length} guardian record(s) shared by too many children`}
          >
            {`${overloadedNames}. Each is attached to more than ${IMPLAUSIBLE_GUARDIAN_CHILDREN} children, so it is almost certainly a placeholder rather than one parent. These are left out of the families below — split them into real guardian records and the children will group correctly.`}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Families"
          value={String(families.length)}
          sublabel="two or more children"
          tone={families.length > 0 ? "brand" : "neutral"}
        />
        <StatTile
          label="Children in them"
          value={String(totalChildren)}
          sublabel={`of ${roll.length} on the roll`}
        />
        <StatTile
          label="From sibling records"
          value={String(recordedFamilies)}
          sublabel="confirmed at admission"
          tone={recordedFamilies > 0 ? "success" : "neutral"}
        />
        <StatTile
          label="Inferred only"
          value={String(inferredFamilies)}
          sublabel={
            inferredFamilies > 0 ? "sibling data not entered" : "all confirmed"
          }
          tone={inferredFamilies > 0 ? "warning" : "success"}
        />
      </div>

      {canSeeAdmissions ? (
        <Card className="mt-4">
          <CardHeader
            title="Families on the roll"
            description="Largest first. A family linked by a sibling record and by a shared guardian appears once."
          />
          {families.length === 0 ? (
            <EmptyState
              title="No families with two children found"
              description="Either no student has a sibling on this roll, or no two students share a guardian record."
            />
          ) : (
            <ul className="divide-y divide-border">
              {families.map((family) => (
                <li key={family.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {family.contactName ?? "Guardian not recorded"}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        <span className="numeric">
                          {family.contactPhone ?? "no phone on file"}
                        </span>
                        {family.contactRelationship ? (
                          <>
                            <span>·</span>
                            <span>{family.contactRelationship}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Badge tone="info">
                        {family.children.length} children
                      </Badge>
                      <Badge
                        tone={family.fromSiblingRecord ? "success" : "warning"}
                      >
                        {family.fromSiblingRecord
                          ? "Sibling record"
                          : "Shared guardian only"}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {family.children.map((child) => (
                      <div
                        key={child.id}
                        className="rounded-[var(--radius-base)] border border-border bg-surface-sunken/40 px-3 py-2"
                      >
                        <Link
                          href={`/students/${child.id}`}
                          className="block truncate text-[13px] font-medium text-foreground hover:text-brand"
                        >
                          {child.name}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span className="font-mono">{child.admissionNo}</span>
                          <span>·</span>
                          <span>{child.classSection}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Siblings studying elsewhere"
          description="Named at admission but not on this roll — the front office's warmest admission leads"
        />
        {prospective.length === 0 ? (
          <EmptyState
            title="None recorded"
            description="No sibling has been captured with a school other than this one."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sibling</Th>
                <Th>Relation</Th>
                <Th>Date of birth</Th>
                <Th>Studies at</Th>
                <Th>Named by</Th>
              </tr>
            </thead>
            <tbody>
              {prospective.map((row) => (
                <tr key={row.id} className="hover:bg-surface-hover">
                  <Td className="font-medium">
                    {row.name}
                    {row.notes ? (
                      <span className="mt-0.5 block text-[11px] font-normal text-muted">
                        {row.notes}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-muted-strong">
                    {RELATION_LABEL[row.relation]}
                  </Td>
                  <Td className="numeric text-muted-strong">
                    {formatDateOnly(row.dateOfBirth)}
                  </Td>
                  <Td className="text-muted-strong">{row.schoolName ?? "—"}</Td>
                  <Td>
                    {row.student ? (
                      <Link
                        href={`/students/${row.student.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {studentName(row.student)}
                        <span className="ml-1.5 font-mono text-[11px] font-normal text-muted">
                          {row.student.admissionNo}
                        </span>
                      </Link>
                    ) : row.application ? (
                      <Link
                        href={`/admissions/${row.application.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {studentName(row.application)}
                        <span className="ml-1.5 font-mono text-[11px] font-normal text-muted">
                          {row.application.applicationNo}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
