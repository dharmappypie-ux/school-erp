import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/siblings
 *
 * Families on the roll — the sibling report.
 *
 * Two signals describe a family: an explicit sibling record that points at
 * another student, and a guardian shared between students. They are merged in
 * ONE union-find rather than listed separately, because a family that both
 * signals describe would otherwise be counted, and printed, twice.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "students.read");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const roll = await db.student.findMany({
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
            select: { name: true, classLevel: { select: { name: true, numericOrder: true } } },
          },
        },
      },
      guardians: {
        select: {
          isPrimary: true,
          relationship: true,
          guardian: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      },
      siblings: {
        where: { siblingStudentId: { not: null } },
        select: { siblingStudentId: true },
      },
    },
  });

  const onRoll = new Set(roll.map((s) => s.id));

  // Union-find over both signals.
  const parent = new Map<string, string>(roll.map((s): [string, string] => [s.id, s.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression, so a long chain costs once.
    let walk = id;
    while (parent.get(walk) !== root) {
      const next = parent.get(walk)!;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const student of roll) {
    for (const link of student.siblings) {
      if (link.siblingStudentId && onRoll.has(link.siblingStudentId)) {
        union(student.id, link.siblingStudentId);
      }
    }
  }

  const byGuardian = new Map<string, string[]>();
  for (const student of roll) {
    for (const row of student.guardians) {
      const list = byGuardian.get(row.guardian.id) ?? [];
      list.push(student.id);
      byGuardian.set(row.guardian.id, list);
    }
  }
  for (const students of byGuardian.values()) {
    for (let i = 1; i < students.length; i += 1) union(students[0], students[i]);
  }

  const byId = new Map(roll.map((s) => [s.id, s]));
  const groups = new Map<string, string[]>();
  for (const student of roll) {
    const root = find(student.id);
    const list = groups.get(root) ?? [];
    list.push(student.id);
    groups.set(root, list);
  }

  const families = [...groups.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => {
      const members = ids.map((id) => byId.get(id)!);
      const guardians = new Map<string, { name: string; phone: string | null }>();
      for (const m of members) {
        for (const row of m.guardians) {
          guardians.set(row.guardian.id, {
            name: `${row.guardian.firstName} ${row.guardian.lastName ?? ""}`.trim(),
            phone: row.guardian.phone,
          });
        }
      }
      return {
        size: members.length,
        guardians: [...guardians.values()],
        students: members
          .map((m) => {
            const section = m.enrollments[0]?.section;
            return {
              id: m.id,
              name: `${m.firstName} ${m.lastName ?? ""}`.trim(),
              admissionNo: m.admissionNo,
              className: section
                ? `${section.classLevel.name} · ${section.name}`
                : "Not enrolled",
              order: section?.classLevel.numericOrder ?? 0,
            };
          })
          .sort((a, b) => b.order - a.order),
      };
    })
    .sort((a, b) => b.size - a.size || a.students[0].name.localeCompare(b.students[0].name));

  return cors(NextResponse.json({
    totals: {
      students: roll.length,
      families: families.length,
      withSiblings: families.reduce((sum, f) => sum + f.size, 0),
    },
    families,
  }));
}
