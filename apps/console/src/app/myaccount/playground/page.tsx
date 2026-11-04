import {
  cookies,
  headers,
} from "next/headers";

import {
  redirect,
} from "next/navigation";

import {
  auth,
} from "@/lib/auth";

import {
  ACTIVE_COOKIE,
  getWorkspaceContext,
} from "@/lib/workspaces";

import GuidedPlaygroundClient from "./guided-playground-client";

import "./guided-playground.css";

export const dynamic =
  "force-dynamic";

export default async function Page() {
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
    <GuidedPlaygroundClient
      userId={
        session.user.id
      }
      workspaceId={
        workspaceContext.active.id
      }
    />
  );
}
