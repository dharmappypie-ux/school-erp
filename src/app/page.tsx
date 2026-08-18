import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth";
import { resolveHomeRoute } from "@/lib/permissions";

export default async function RootPage() {
  const session = await getSessionContext();
  redirect(session ? resolveHomeRoute(session.roleKeys) : "/login");
}
