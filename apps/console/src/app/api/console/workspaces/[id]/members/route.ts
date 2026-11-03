import { db } from "@/lib/db";

import {
  requireConsoleUser,
} from "@/lib/console-auth";

import {
  requireMembership,
} from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  const user =
    await requireConsoleUser(request);

  if (!user) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const role =
    await requireMembership(
      user.id,
      id,
    );

  if (!role) {
    return Response.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  const members =
    await db.query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          wm.role,
          wm.created_at
        FROM workspace_members wm
        JOIN "user" u
          ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
        ORDER BY
          CASE wm.role
            WHEN 'owner' THEN 1
            WHEN 'admin' THEN 2
            ELSE 3
          END,
          lower(u.email)
      `,
      [id],
    );

  let invitations: unknown[] = [];

  if (
    role === "owner" ||
    role === "admin"
  ) {
    const result =
      await db.query(
        `
          SELECT
            id,
            email,
            role,
            created_at,
            expires_at,
            used_at,
            revoked_at
          FROM workspace_invitations
          WHERE workspace_id = $1
          ORDER BY created_at DESC
        `,
        [id],
      );

    invitations =
      result.rows;
  }

  return Response.json({
    currentRole: role,
    members: members.rows,
    invitations,
  });
}
