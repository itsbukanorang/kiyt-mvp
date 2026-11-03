import {
  createHash,
  randomBytes,
  randomUUID,
} from "crypto";

import { db } from "@/lib/db";

import {
  mutationOriginAllowed,
  requireConsoleUser,
} from "@/lib/console-auth";

import {
  requireMembership,
} from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
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

  const { id } = await params;

  const actorRole =
    await requireMembership(
      user.id,
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

  let body: {
    email?: unknown;
    role?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid request" },
      { status: 400 },
    );
  }

  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  const role =
    body.role === "admin" ||
    body.role === "member"
      ? body.role
      : null;

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    return Response.json(
      { error: "Valid email required" },
      { status: 400 },
    );
  }

  if (!role) {
    return Response.json(
      { error: "Invalid role" },
      { status: 400 },
    );
  }

  const existingMember =
    await db.query(
      `
        SELECT 1
        FROM workspace_members wm
        JOIN "user" u
          ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
          AND lower(u.email) = $2
        LIMIT 1
      `,
      [id, email],
    );

  if (existingMember.rowCount) {
    return Response.json(
      {
        error:
          "User is already a workspace member",
      },
      { status: 409 },
    );
  }

  const pending =
    await db.query(
      `
        SELECT 1
        FROM workspace_invitations
        WHERE workspace_id = $1
          AND lower(email) = $2
          AND used_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > now()
        LIMIT 1
      `,
      [id, email],
    );

  if (pending.rowCount) {
    return Response.json(
      {
        error:
          "An active invite already exists",
      },
      { status: 409 },
    );
  }

  const token =
    randomBytes(32)
      .toString("base64url");

  const tokenHash =
    createHash("sha256")
      .update(token)
      .digest("hex");

  const inviteId =
    `inv_${randomUUID()}`;

  await db.query(
    `
      INSERT INTO workspace_invitations (
        id,
        workspace_id,
        email,
        role,
        token_hash,
        created_by_user_id,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        now() + interval '7 days'
      )
    `,
    [
      inviteId,
      id,
      email,
      role,
      tokenHash,
      user.id,
    ],
  );

  const base =
    process.env.BETTER_AUTH_URL ??
    "https://console.kiyt.io";

  return Response.json(
    {
      id: inviteId,

      inviteUrl:
        `${base}/invite#${token}`,

      warning:
        "Copy this invite link now. It will not be shown again.",
    },
    { status: 201 },
  );
}
