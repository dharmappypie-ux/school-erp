import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * POST /api/mobile/v1/admin/_cleanup — TEMPORARY maintenance route.
 *
 * Deletes QA test rows (prefixed "QATEST") created while verifying the app, in
 * the caller's own school. Super-admin only. Each model is deleted
 * independently and tolerant of FK constraints, so a blocked row doesn't stop
 * the rest. Remove this route after running.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  if (!session.permissions.includes("*")) {
    return cors(NextResponse.json({ error: "Super admin only." }, { status: 403 }));
  }

  const db = scopedDb(session.schoolId);
  const results: Record<string, number | string> = {};
  const P = { startsWith: "QATEST" };

  async function run(name: string, fn: () => Promise<{ count: number }>) {
    try { results[name] = (await fn()).count; }
    catch (e) { results[name] = `skipped (${e instanceof Error ? e.message.split("\n")[0] : "error"})`; }
  }

  await run("homework", () => db.homework.deleteMany({ where: { title: P } }));
  await run("books", () => db.book.deleteMany({ where: { title: P } }));
  await run("notices", () => db.notice.deleteMany({ where: { title: P } }));
  await run("quizzes", () => db.quiz.deleteMany({ where: { title: P } }));
  await run("courses", () => db.course.deleteMany({ where: { title: P } }));
  await run("messages", () => db.message.deleteMany({ where: { body: P } }));
  await run("subjects", () => db.subject.deleteMany({ where: { name: P } }));
  await run("students", () => db.student.deleteMany({ where: { firstName: P } }));
  await run("staff", () => db.staffMember.deleteMany({ where: { firstName: P } }));

  // Empty 1:1 threads left behind by deleted messages.
  await run("emptyThreads", async () => {
    const empty = await db.messageThread.findMany({
      where: { messages: { none: {} } }, select: { id: true },
    });
    if (empty.length === 0) return { count: 0 };
    return db.messageThread.deleteMany({ where: { id: { in: empty.map((t) => t.id) } } });
  });

  return cors(NextResponse.json({ ok: true, deleted: results }));
}
