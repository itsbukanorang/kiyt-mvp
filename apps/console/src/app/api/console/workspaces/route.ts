import {
  cookies,
} from "next/headers";

import {
  requireConsoleUser,
  mutationOriginAllowed,
} from "@/lib/console-auth";

import {
  ACTIVE_COOKIE,
  createWorkspace,
  getWorkspaceContext,
} from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
) {
  const user =
    await requireConsoleUser(
      request,
    );

  if (!user) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const store =
    await cookies();

  const context =
    await getWorkspaceContext(
      user.id,
      store.get(
        ACTIVE_COOKIE,
      )?.value,
    );

  return Response.json({
    activeWorkspaceId:
      context.active.id,
    workspaces:
      context.workspaces,
  });
}

export async function POST(
  request: Request,
) {
  if (
    !mutationOriginAllowed(
      request,
    )
  ) {
    return Response.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const user =
    await requireConsoleUser(
      request,
    );

  if (!user) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  let body: {
    name?: unknown;
  };

  try {
    body =
      await request.json();
  } catch {
    return Response.json(
      {
        error: "Invalid request",
      },
      {
        status: 400,
      },
    );
  }

  if (
    typeof body.name !==
    "string"
  ) {
    return Response.json(
      {
        error:
          "Workspace name is required",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const id =
      await createWorkspace(
        user.id,
        body.name,
      );

    const store =
      await cookies();

    store.set(
      ACTIVE_COOKIE,
      id,
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge:
          60 * 60 * 24 * 30,
      },
    );

    return Response.json(
      {
        id,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create workspace",
      },
      {
        status: 400,
      },
    );
  }
}
