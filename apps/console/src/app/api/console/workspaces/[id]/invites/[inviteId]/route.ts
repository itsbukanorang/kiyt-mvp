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
      inviteId: string;
    }>;
  },
) {
  if (!mutationOriginAllowed(request)) {
    return Response.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const user =
    await requireConsoleUser(request);

  if (!user) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const {
    id,
    inviteId,
  } = await params;

  const role =
    await requireMembership(
      user.id,
      id,
    );

  if (
    role !== "owner" &&
    role !== "admin"
  ) {
    return Response.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const result =
    await db.query(
      `
        UPDATE workspace_invitations
        SET revoked_at = now()
        WHERE id = $1
          AND workspace_id = $2
          AND used_at IS NULL
          AND revoked_at IS NULL
        RETURNING id
      `,
      [inviteId, id],
    );

  if (result.rowCount !== 1) {
    return Response.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
