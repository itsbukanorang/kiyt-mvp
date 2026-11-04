"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  Badge,
  Card,
  PageTitle,
} from "@/components/dashboard/ui";

type Member = {
  id: string;
  name: string | null;
  email: string;
  role:
    | "owner"
    | "admin"
    | "member";
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
};

export default function WorkspaceMembersClient({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [members, setMembers] =
    useState<Member[]>([]);

  const [invites, setInvites] =
    useState<Invitation[]>([]);

  const [currentRole, setCurrentRole] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [role, setRole] =
    useState("member");

  const [inviteUrl, setInviteUrl] =
    useState("");

  const [error, setError] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  async function load() {
    const response =
      await fetch(
        `/api/console/workspaces/${workspaceId}/members`,
        {
          cache: "no-store",
        },
      );

    const body =
      await response.json();

    if (!response.ok) {
      throw new Error(
        body.error ||
        "Unable to load members",
      );
    }

    setMembers(body.members ?? []);
    setInvites(
      body.invitations ?? [],
    );
    setCurrentRole(
      body.currentRole ?? "",
    );
  }

  useEffect(() => {
    load().catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load members",
      ),
    );
  }, []);

  async function invite(
    event: FormEvent,
  ) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setInviteUrl("");

    try {
      const response =
        await fetch(
          `/api/console/workspaces/${workspaceId}/invites`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                email,
                role,
              }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Unable to create invite",
        );
      }

      setInviteUrl(
        body.inviteUrl,
      );

      setEmail("");

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create invite",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(
    inviteId: string,
  ) {
    setBusy(true);

    try {
      const response =
        await fetch(
          `/api/console/workspaces/${workspaceId}/invites/${inviteId}`,
          {
            method: "DELETE",
          },
        );

      if (!response.ok) {
        throw new Error(
          "Unable to revoke invite",
        );
      }

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to revoke invite",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(
    userId: string,
  ) {
    setBusy(true);

    try {
      const response =
        await fetch(
          `/api/console/workspaces/${workspaceId}/members/${userId}`,
          {
            method: "DELETE",
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Unable to remove member",
        );
      }

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to remove member",
      );
    } finally {
      setBusy(false);
    }
  }

  const canManage =
    currentRole === "owner" ||
    currentRole === "admin";

  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE MANAGEMENT"
        title="Members"
        description="Manage workspace members and invitations."
      >
        <Badge tone="blue">
          {currentRole.toUpperCase() ||
            "MEMBER"}
        </Badge>
      </PageTitle>

      {error && (
        <div className="notice">
          <p>{error}</p>
        </div>
      )}

      {inviteUrl && (
        <div className="notice">
          <div>
            <strong>
              Copy this invite link now.
            </strong>

            <p>
              It will not be shown again.
            </p>

            <pre className="mt-3 overflow-auto">
              {inviteUrl}
            </pre>

            <button
              type="button"
              className="button secondary"
              onClick={() =>
                navigator.clipboard.writeText(
                  inviteUrl,
                )
              }
            >
              Copy invite link
            </button>
          </div>
        </div>
      )}

      <Card className="workspace-members-card">
        <div className="panel-heading">
          <div>
            <h2>Members</h2>
            <p>
              People with access to this workspace.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="workspace-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {members.map(
                (member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>
                        {member.name ||
                          member.email}
                      </strong>

                      <div className="workspace-muted">
                        {member.email}
                      </div>
                    </td>

                    <td>
                      <Badge
                        tone={
                          member.role ===
                          "owner"
                            ? "blue"
                            : member.role ===
                              "admin"
                            ? "amber"
                            : "neutral"
                        }
                      >
                        {member.role.toUpperCase()}
                      </Badge>
                    </td>

                    <td>
                      {canManage &&
                      member.role !==
                        "owner" ? (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            removeMember(
                              member.id,
                            )
                          }
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="workspace-muted">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {canManage && (
        <Card className="form-panel workspace-invite-card">
          <div className="panel-heading">
            <div>
              <h2>Invite member</h2>
              <p>
                Invite an admin or member by email.
              </p>
            </div>
          </div>

          <form onSubmit={invite}>
            <label htmlFor="invite-email">
              Email
            </label>

            <input
              id="invite-email"
              className="workspace-input"
              type="email"
              required
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
            />

            <label htmlFor="invite-role">
              Role
            </label>

            <select
              id="invite-role"
              className="workspace-input"
              value={role}
              onChange={(event) =>
                setRole(
                  event.target.value,
                )
              }
            >
              <option value="member">
                Member
              </option>
              <option value="admin">
                Admin
              </option>
            </select>

            <button
              className="button primary full-button"
              disabled={busy}
            >
              Create invite
            </button>
          </form>
        </Card>
      )}

      {canManage &&
        invites.length > 0 && (
          <Card className="workspace-invitations-card">
            <div className="panel-heading">
              <div>
                <h2>
                  Invitations
                </h2>
                <p>
                  Pending and previous workspace invites.
                </p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {invites.map(
                    (invite) => {
                      const pending =
                        !invite.used_at &&
                        !invite.revoked_at &&
                        new Date(
                          invite.expires_at,
                        ).getTime() >
                          Date.now();

                      return (
                        <tr
                          key={invite.id}
                        >
                          <td>
                            {invite.email}
                          </td>

                          <td>
                            {invite.role}
                          </td>

                          <td>
                            {invite.used_at
                              ? "Used"
                              : invite.revoked_at
                              ? "Revoked"
                              : pending
                              ? "Pending"
                              : "Expired"}
                          </td>

                          <td>
                            {pending ? (
                              <button
                                type="button"
                                className="button secondary"
                                disabled={busy}
                                onClick={() =>
                                  revokeInvite(
                                    invite.id,
                                  )
                                }
                              >
                                Revoke
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
    </>
  );
}
