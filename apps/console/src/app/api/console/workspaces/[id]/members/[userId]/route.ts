import { db } from "@/lib/db";

import {
  mutationOriginAllowed,
  requireConsoleUser,
} from "@/lib/console-auth";

import {
  requireMembership,
} from "@/lib/workspaces";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      userId: string;
    }>;
  },
) {
  if (!mutationOriginAllowed(request)) {
    return Response.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const actor =
    await requireConsoleUser(request);

  if (!actor) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const {
    id,
    userId,
  } = await params;

  const actorRole =
    await requireMembership(
      actor.id,
      id,
    );

  if (
    actorRole !== "owner" &&
    actorRole !== "admin"
  ) {
    return Response.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  if (actor.id === userId) {
    return Response.json(
      {
        error:
          "Self-removal is not available in MVP",
      },
      { status: 409 },
    );
  }

  const target =
    await db.query(
      `
        SELECT role
        FROM workspace_members
        WHERE workspace_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [id, userId],
    );

  if (target.rowCount !== 1) {
    return Response.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  const targetRole =
    target.rows[0].role;

  if (targetRole === "owner") {
    return Response.json(
      {
        error:
          "Owner transfer is not available in MVP",
      },
      { status: 409 },
    );
  }

  if (
    actorRole === "admin" &&
    targetRole === "admin"
  ) {
    return Response.json(
      {
        error:
          "Admin cannot remove another admin",
      },
      { status: 403 },
    );
  }

  await db.query(
    `
      DELETE FROM workspace_members
      WHERE workspace_id = $1
        AND user_id = $2
    `,
    [id, userId],
  );

  return Response.json({ ok: true });
}
