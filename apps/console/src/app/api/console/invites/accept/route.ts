import {
  createHash,
} from "crypto";

import {
  cookies,
} from "next/headers";

import { db } from "@/lib/db";

import {
  mutationOriginAllowed,
  requireConsoleUser,
} from "@/lib/console-auth";

import {
  ACTIVE_COOKIE,
} from "@/lib/workspaces";

export const runtime = "nodejs";

export async function POST(
  request: Request,
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

  let body: {
    token?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid request" },
      { status: 400 },
    );
  }

  if (
    typeof body.token !== "string" ||
    body.token.length < 20
  ) {
    return Response.json(
      { error: "Invalid invite" },
      { status: 400 },
    );
  }

  const tokenHash =
    createHash("sha256")
      .update(body.token)
      .digest("hex");

  const client =
    await db.connect();

  try {
    await client.query("BEGIN");

    const result =
      await client.query(
        `
          SELECT
            id,
            workspace_id,
            email,
            role,
            expires_at,
            used_at,
            revoked_at,
            accepted_by_user_id
          FROM workspace_invitations
          WHERE token_hash = $1
          FOR UPDATE
        `,
        [tokenHash],
      );

    if (result.rowCount !== 1) {
      await client.query("ROLLBACK");

      return Response.json(
        { error: "Invite not found" },
        { status: 404 },
      );
    }

    const invite =
      result.rows[0];

    if (
      invite.used_at &&
      invite.accepted_by_user_id ===
        user.id
    ) {
      await client.query("COMMIT");

      const store =
        await cookies();

      store.set(
        ACTIVE_COOKIE,
        invite.workspace_id,
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
        workspaceId:
          invite.workspace_id,
      });
    }

    if (invite.revoked_at) {
      await client.query("ROLLBACK");

      return Response.json(
        { error: "Invite revoked" },
        { status: 410 },
      );
    }

    if (
      new Date(invite.expires_at)
        .getTime() <= Date.now()
    ) {
      await client.query("ROLLBACK");

      return Response.json(
        { error: "Invite expired" },
        { status: 410 },
      );
    }

    if (invite.used_at) {
      await client.query("ROLLBACK");

      return Response.json(
        {
          error:
            "Invite already used",
        },
        { status: 409 },
      );
    }

    if (
      String(invite.email)
        .toLowerCase() !==
      user.email.toLowerCase()
    ) {
      await client.query("ROLLBACK");

      return Response.json(
        {
          error:
            "Invite email does not match your account",
        },
        { status: 403 },
      );
    }

    await client.query(
      `
        INSERT INTO workspace_members (
          workspace_id,
          user_id,
          role
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (
          workspace_id,
          user_id
        )
        DO NOTHING
      `,
      [
        invite.workspace_id,
        user.id,
        invite.role,
      ],
    );

    await client.query(
      `
        UPDATE workspace_invitations
        SET
          used_at = now(),
          accepted_by_user_id = $2
        WHERE id = $1
      `,
      [
        invite.id,
        user.id,
      ],
    );

    await client.query("COMMIT");

    const store =
      await cookies();

    store.set(
      ACTIVE_COOKIE,
      invite.workspace_id,
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
      workspaceId:
        invite.workspace_id,
    });
  } catch {
    await client.query("ROLLBACK");

    return Response.json(
      {
        error:
          "Unable to accept invite",
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
