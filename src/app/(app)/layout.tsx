import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { accountSummary } from "@/lib/account";
import { requireAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { visibleNavigation } from "@/lib/navigation";
import { ROLE_PRESET_BY_KEY } from "@/lib/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireAuth();

  // An account handed out with a temporary password must replace it before it
  // can be used. Enforced here rather than only at login: the login redirect
  // alone is one click to step around, so until today every temporary password
  // stayed in use for good. /change-password lives in the (auth) group, outside
  // this layout, so this cannot loop.
  if (session.mustChangePassword) redirect("/change-password");

  const navigation = visibleNavigation(
    session.permissions,
    session.roleKeys,
    session.studentId !== null || session.guardianId !== null,
    session.school.plan,
  );
  const roleNames = session.roleKeys.map(
    (key) => ROLE_PRESET_BY_KEY.get(key)?.name ?? key,
  );
  const account = await accountSummary(session);

  return (
    <AppShell
      navigation={navigation}
      user={{
        name: session.fullName,
        email: session.email,
        initials: initials(session.firstName, session.lastName),
        roleLabel: roleNames.join(", ") || "Member",
        avatarUrl: session.avatarUrl,
      }}
      account={account}
      school={{ name: session.school.name, slug: session.school.slug }}
      academicYear={session.academicYear?.name ?? null}
    >
      {children}
    </AppShell>
  );
}
