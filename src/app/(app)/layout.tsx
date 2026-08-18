import { AppShell } from "@/components/app-shell";
import { requireAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { visibleNavigation } from "@/lib/navigation";
import { ROLE_PRESET_BY_KEY } from "@/lib/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireAuth();

  const navigation = visibleNavigation(
    session.permissions,
    session.roleKeys,
    session.studentId !== null || session.guardianId !== null,
  );
  const roleNames = session.roleKeys.map(
    (key) => ROLE_PRESET_BY_KEY.get(key)?.name ?? key,
  );

  return (
    <AppShell
      navigation={navigation}
      user={{
        name: session.fullName,
        email: session.email,
        initials: initials(session.firstName, session.lastName),
        roles: roleNames,
      }}
      school={{ name: session.school.name, slug: session.school.slug }}
      academicYear={session.academicYear?.name ?? null}
    >
      {children}
    </AppShell>
  );
}
