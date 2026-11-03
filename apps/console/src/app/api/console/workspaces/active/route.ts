import {
  cookies,
} from "next/headers";

import {
  requireConsoleUser,
  mutationOriginAllowed,
} from "@/lib/console-auth";

import {
  ACTIVE_COOKIE,
  requireMembership,
} from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    workspaceId?: unknown;
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
    typeof body.workspaceId !==
    "string"
  ) {
    return Response.json(
      {
        error:
          "workspaceId is required",
      },
      {
        status: 400,
      },
    );
  }

  const role =
    await requireMembership(
      user.id,
      body.workspaceId,
    );

  if (!role) {
    return Response.json(
      {
        error: "Not found",
      },
      {
        status: 404,
      },
    );
  }

  const store =
    await cookies();

  store.set(
    ACTIVE_COOKIE,
    body.workspaceId,
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge:
        60 * 60 * 24 * 30,
    },
  );

  return Response.json({
    ok: true,
  });
}
