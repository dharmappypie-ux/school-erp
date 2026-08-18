import { NextResponse, type NextRequest } from "next/server";

import { destroySession } from "@/lib/session";

export async function POST(request: NextRequest) {
  await destroySession();
  // Resolved against the incoming request so the redirect is correct behind a
  // proxy, on a non-default port, or under any tenant hostname.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
