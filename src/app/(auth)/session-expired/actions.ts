"use server";

import { redirect } from "next/navigation";

import { destroySession } from "@/lib/session";

/**
 * Clears the dead session, then sends the user to sign in.
 *
 * The cookie outlives the session it points at — an administrator revoking
 * someone's access, or the server-side expiry passing, leaves the browser
 * holding a token that no longer resolves. Deleting it here means the next
 * visit to a protected page lands on the login form rather than bouncing
 * through this page again.
 */
export async function clearExpiredSession(): Promise<void> {
  await destroySession();
  redirect("/login");
}
