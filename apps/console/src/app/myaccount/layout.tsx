import {
  headers,
  cookies,
} from "next/headers";

import {
  redirect,
} from "next/navigation";

import { auth } from "@/lib/auth";
import {
  ACTIVE_COOKIE,
  getWorkspaceContext,
} from "@/lib/workspaces";

import {
  ConsoleShell,
} from "@/components/dashboard/console-shell";

import "./dashboard.css";

export const dynamic =
  "force-dynamic";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session =
    await auth.api.getSession({
      headers:
        await headers(),
    });

  if (!session) {
    redirect("/");
  }

  const store =
    await cookies();

  const workspaceContext =
    await getWorkspaceContext(
      session.user.id,
      store.get(
        ACTIVE_COOKIE,
      )?.value,
    );

  return (
    <ConsoleShell
      userName={
        session.user.name ||
        "Member"
      }
      userEmail={
        session.user.email
      }
      activeWorkspaceName={
        workspaceContext.active.name
      }
    >
      {children}
    </ConsoleShell>
  );
}
