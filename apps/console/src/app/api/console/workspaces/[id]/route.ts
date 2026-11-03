import {
  db,
} from "@/lib/db";

import {
  mutationOriginAllowed,
  requireConsoleUser,
} from "@/lib/console-auth";

import {
  requireMembership,
} from "@/lib/workspaces";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
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

  const {
    id,
  } =
    await params;

  const role =
    await requireMembership(
      user.id,
      id,
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

  if (role !== "owner") {
    return Response.json(
      {
        error:
          "Only the workspace owner can rename it",
      },
      {
        status: 403,
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
        error:
          "Invalid request",
      },
      {
        status: 400,
      },
    );
  }

  const name =
    typeof body.name ===
      "string"
      ? body.name.trim()
      : "";

  if (
    name.length < 1 ||
    name.length > 80
  ) {
    return Response.json(
      {
        error:
          "Workspace name must be 1-80 characters",
      },
      {
        status: 400,
      },
    );
  }

  const result =
    await db.query(
      `
        UPDATE workspaces
        SET name = $1
        WHERE id = $2
        RETURNING id, name
      `,
      [
        name,
        id,
      ],
    );

  if (result.rowCount !== 1) {
    return Response.json(
      {
        error: "Not found",
      },
      {
        status: 404,
      },
    );
  }

  return Response.json({
    id,
    name:
      result.rows[0].name,
  });
}
