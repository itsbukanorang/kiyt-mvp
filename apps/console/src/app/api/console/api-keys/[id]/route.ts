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
  getWorkspaceContext,
} from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
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

  const store =
    await cookies();

  const context =
    await getWorkspaceContext(
      user.id,
      store.get(
        ACTIVE_COOKIE,
      )?.value,
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

  const {
    id,
  } =
    await params;

  const result =
    await db.query(
      `
        UPDATE api_keys
        SET revoked_at = now()
        WHERE id = $1
          AND workspace_id = $2
          AND revoked_at IS NULL
        RETURNING id
      `,
      [
        id,
        context.active.id,
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
    ok: true,
  });
}
