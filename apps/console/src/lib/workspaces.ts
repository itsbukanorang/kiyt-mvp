import {
  createHash,
  randomBytes,
  randomUUID,
} from "crypto";

import type {
  PoolClient,
} from "pg";

import { db } from "@/lib/db";

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "member";

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: WorkspaceRole;
  createdAt: string;
};

const ACTIVE_COOKIE =
  "kiyt_active_workspace";

function defaultWorkspaceId(
  userId: string,
) {
  const digest =
    createHash("sha256")
      .update(userId)
      .digest("hex")
      .slice(0, 24);

  return `ws_${digest}`;
}

export async function ensureFirstWorkspace(
  userId: string,
) {
  const workspaceId =
    defaultWorkspaceId(userId);

  const client =
    await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO workspaces (
          id,
          name,
          created_by_user_id
        )
        VALUES (
          $1,
          'Default',
          $2
        )
        ON CONFLICT (id)
        DO NOTHING
      `,
      [
        workspaceId,
        userId,
      ],
    );

    await client.query(
      `
        INSERT INTO workspace_members (
          workspace_id,
          user_id,
          role
        )
        VALUES (
          $1,
          $2,
          'owner'
        )
        ON CONFLICT (
          workspace_id,
          user_id
        )
        DO NOTHING
      `,
      [
        workspaceId,
        userId,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return workspaceId;
}

export async function listWorkspaces(
  userId: string,
): Promise<WorkspaceSummary[]> {
  await ensureFirstWorkspace(
    userId,
  );

  const result =
    await db.query(
      `
        SELECT
          w.id,
          w.name,
          wm.role,
          w.created_at
        FROM workspace_members wm
        JOIN workspaces w
          ON w.id = wm.workspace_id
        WHERE wm.user_id = $1
        ORDER BY
          w.created_at ASC,
          w.id ASC
      `,
      [
        userId,
      ],
    );

  return result.rows.map(
    (row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      createdAt:
        row.created_at
          instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    }),
  );
}

export async function getWorkspaceContext(
  userId: string,
  requestedWorkspaceId?:
    | string
    | null,
) {
  const workspaces =
    await listWorkspaces(userId);

  if (workspaces.length === 0) {
    throw new Error(
      "No workspace available",
    );
  }

  const active =
    workspaces.find(
      (workspace) =>
        workspace.id ===
        requestedWorkspaceId,
    ) ?? workspaces[0];

  return {
    workspaces,
    active,
  };
}

export async function createWorkspace(
  userId: string,
  name: string,
) {
  const normalized =
    name.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 80
  ) {
    throw new Error(
      "Workspace name must be 1-80 characters",
    );
  }

  const workspaceId =
    `ws_${randomUUID()}`;

  const client =
    await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO workspaces (
          id,
          name,
          created_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3
        )
      `,
      [
        workspaceId,
        normalized,
        userId,
      ],
    );

    await client.query(
      `
        INSERT INTO workspace_members (
          workspace_id,
          user_id,
          role
        )
        VALUES (
          $1,
          $2,
          'owner'
        )
      `,
      [
        workspaceId,
        userId,
      ],
    );

    await client.query("COMMIT");

    return workspaceId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function requireMembership(
  userId: string,
  workspaceId: string,
) {
  const result =
    await db.query(
      `
        SELECT role
        FROM workspace_members
        WHERE workspace_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [
        workspaceId,
        userId,
      ],
    );

  if (result.rowCount !== 1) {
    return null;
  }

  return result.rows[0]
    .role as WorkspaceRole;
}

export async function createApiKey(
  client: PoolClient,
  input: {
    workspaceId: string;
    userId: string;
    name: string;
  },
) {
  const secret =
    randomBytes(32)
      .toString("base64url");

  const rawKey =
    `kiyt_${secret}`;

  const keyHash =
    createHash("sha256")
      .update(rawKey)
      .digest("hex");

  const id =
    `key_${randomUUID()}`;

  const prefix =
    rawKey.slice(0, 14);

  await client.query(
    `
      INSERT INTO api_keys (
        id,
        workspace_id,
        created_by_user_id,
        name,
        key_prefix,
        key_hash
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      )
    `,
    [
      id,
      input.workspaceId,
      input.userId,
      input.name,
      prefix,
      keyHash,
    ],
  );

  return {
    id,
    rawKey,
    prefix,
  };
}

export {
  ACTIVE_COOKIE,
};
