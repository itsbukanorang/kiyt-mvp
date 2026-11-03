import {
  cookies,
} from "next/headers";

import { db } from "@/lib/db";

import {
  requireConsoleUser,
  mutationOriginAllowed,
} from "@/lib/console-auth";

import {
  ACTIVE_COOKIE,
  createApiKey,
  getWorkspaceContext,
} from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function contextFor(
  userId: string,
) {
  const store =
    await cookies();

  return getWorkspaceContext(
    userId,
    store.get(
      ACTIVE_COOKIE,
    )?.value,
  );
}

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

  const context =
    await contextFor(
      user.id,
    );

  if (
    context.active.role ===
    "member"
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

  const result =
    await db.query(
      `
        SELECT
          id,
          name,
          key_prefix,
          created_at,
          last_used_at,
          revoked_at
        FROM api_keys
        WHERE workspace_id = $1
        ORDER BY created_at DESC
      `,
      [
        context.active.id,
      ],
    );

  return Response.json({
    workspace: {
      id: context.active.id,
      name: context.active.name,
      role: context.active.role,
    },

    keys:
      result.rows.map(
        (row) => ({
          id: row.id,
          name: row.name,
          prefix:
            row.key_prefix,
          createdAt:
            row.created_at,
          lastUsedAt:
            row.last_used_at,
          revokedAt:
            row.revoked_at,
        }),
      ),
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

  const context =
    await contextFor(
      user.id,
    );

  if (
    context.active.role !==
      "owner" &&
    context.active.role !==
      "admin"
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
          "Key name must be 1-80 characters",
      },
      {
        status: 400,
      },
    );
  }

  const client =
    await db.connect();

  try {
    await client.query("BEGIN");

    const created =
      await createApiKey(
        client,
        {
          workspaceId:
            context.active.id,
          userId:
            user.id,
          name,
        },
      );

    await client.query("COMMIT");

    return Response.json(
      {
        id: created.id,
        key: created.rawKey,
        prefix:
          created.prefix,

        warning:
          "Copy this key now. It will not be shown again.",
      },
      {
        status: 201,
      },
    );
  } catch {
    await client.query(
      "ROLLBACK",
    );

    return Response.json(
      {
        error:
          "Unable to create API key",
      },
      {
        status: 500,
      },
    );
  } finally {
    client.release();
  }
}
