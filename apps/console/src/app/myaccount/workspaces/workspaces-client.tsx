"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  Box,
  Check,
  Plus,
} from "lucide-react";

import {
  Badge,
  Card,
  EmptyState,
  PageTitle,
} from "@/components/dashboard/ui";

type Workspace = {
  id: string;
  name: string;
  role:
    | "owner"
    | "admin"
    | "member";
};

export default function WorkspacesClient() {
  const [
    workspaces,
    setWorkspaces,
  ] = useState<Workspace[]>([]);

  const [
    activeId,
    setActiveId,
  ] = useState("");

  const [
    name,
    setName,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    editingId,
    setEditingId,
  ] = useState<string | null>(
    null,
  );

  const [
    editName,
    setEditName,
  ] = useState("");

  async function load() {
    const response =
      await fetch(
        "/api/console/workspaces",
        {
          cache: "no-store",
        },
      );

    const body =
      await response.json();

    if (!response.ok) {
      throw new Error(
        body.error ||
        "Unable to load workspaces",
      );
    }

    setWorkspaces(
      body.workspaces,
    );

    setActiveId(
      body.activeWorkspaceId,
    );
  }

  useEffect(() => {
    load()
      .catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load workspaces",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function create(
    event: FormEvent,
  ) {
    event.preventDefault();

    setError("");
    setBusy(true);

    try {
      const response =
        await fetch(
          "/api/console/workspaces",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                name,
              }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Unable to create workspace",
        );
      }

      setName("");

      await load();

      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create workspace",
      );
    } finally {
      setBusy(false);
    }
  }

  async function rename(
    workspaceId: string,
  ) {
    const value =
      editName.trim();

    if (!value) {
      return;
    }

    setError("");
    setBusy(true);

    try {
      const response =
        await fetch(
          `/api/console/workspaces/${workspaceId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                name: value,
              }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Unable to rename workspace",
        );
      }

      setEditingId(null);
      setEditName("");

      await load();

      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to rename workspace",
      );
    } finally {
      setBusy(false);
    }
  }

  async function activate(
    workspaceId: string,
  ) {
    setError("");
    setBusy(true);

    try {
      const response =
        await fetch(
          "/api/console/workspaces/active",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                workspaceId,
              }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Unable to switch workspace",
        );
      }

      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to switch workspace",
      );

      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE MANAGEMENT"
        title="Workspaces"
        description="Create and switch between the private workspaces you belong to."
      >
        <Badge tone="blue">
          {workspaces.length} WORKSPACE
          {workspaces.length === 1
            ? ""
            : "S"}
        </Badge>
      </PageTitle>

      {error && (
        <div
          className="notice"
          role="alert"
        >
          <Box size={18} />
          <p>{error}</p>
        </div>
      )}

      <Card className="workspace-list-card">
        <div className="panel-heading">
          <div>
            <h2>
              Your workspaces
            </h2>

            <p>
              The active workspace controls
              API keys, runs, memory,
              usage, and billing.
            </p>
          </div>

          <Badge>
            PRIVATE
          </Badge>
        </div>

        {loading ? (
          <EmptyState
            kind="loading"
            title="Loading workspaces"
            description="Reading your workspace memberships."
          />
        ) : workspaces.length === 0 ? (
          <EmptyState
            kind="empty"
            title="No workspace available"
            description="Create your first private workspace."
          />
        ) : (
          <div className="table-wrap">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {workspaces.map(
                  (workspace) => {
                    const active =
                      workspace.id ===
                      activeId;

                    return (
                      <tr
                        key={
                          workspace.id
                        }
                      >
                        <td>
                          <div className="workspace-table-name">
                            <span className="workspace-symbol">
                              <Box size={16} />
                            </span>

                            <strong>
                              {workspace.name}
                            </strong>
                          </div>
                        </td>

                        <td>
                          <Badge
                            tone={
                              workspace.role ===
                              "owner"
                                ? "blue"
                                : workspace.role ===
                                  "admin"
                                ? "amber"
                                : "neutral"
                            }
                          >
                            {workspace.role.toUpperCase()}
                          </Badge>
                        </td>

                        <td>
                          {active ? (
                            <Badge tone="green">
                              <Check size={11} />
                              ACTIVE
                            </Badge>
                          ) : (
                            <span className="workspace-muted">
                              Available
                            </span>
                          )}
                        </td>

                        <td>
                          {editingId ===
                          workspace.id ? (
                            <div className="workspace-inline-edit">
                              <input
                                value={editName}
                                maxLength={80}
                                aria-label="Workspace name"
                                onChange={(event) =>
                                  setEditName(
                                    event.target.value,
                                  )
                                }
                              />

                              <button
                                type="button"
                                className="button primary"
                                disabled={busy}
                                onClick={() =>
                                  rename(
                                    workspace.id,
                                  )
                                }
                              >
                                Save
                              </button>

                              <button
                                type="button"
                                className="button secondary"
                                disabled={busy}
                                onClick={() => {
                                  setEditingId(
                                    null,
                                  );
                                  setEditName("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="workspace-row-actions">
                              {!active && (
                                <button
                                  type="button"
                                  className="button primary"
                                  disabled={busy}
                                  onClick={() =>
                                    activate(
                                      workspace.id,
                                    )
                                  }
                                >
                                  Switch
                                </button>
                              )}

                              <a
                                className="button secondary"
                                href={`/myaccount/workspaces/${workspace.id}`}
                              >
                                Manage
                              </a>

                              {workspace.role ===
                                "owner" && (
                                <button
                                  type="button"
                                  className="button secondary"
                                  disabled={busy}
                                  onClick={() => {
                                    setEditingId(
                                      workspace.id,
                                    );
                                    setEditName(
                                      workspace.name,
                                    );
                                  }}
                                >
                                  Rename
                                </button>
                              )}

                              {active &&
                                workspace.role !==
                                  "owner" && (
                                  <span className="workspace-muted">
                                    Current workspace
                                  </span>
                                )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="form-panel workspace-create-card">
        <div className="panel-heading">
          <div>
            <h2>
              Create workspace
            </h2>

            <p>
              A new private workspace starts
              with you as its owner.
            </p>
          </div>

          <Plus size={18} />
        </div>

        <form onSubmit={create}>
          <label htmlFor="workspace-name">
            Workspace name
            <span>
              1–80 characters
            </span>
          </label>

          <input
            id="workspace-name"
            className="workspace-input"
            value={name}
            maxLength={80}
            required
            placeholder="e.g. KIYT Production"
            onChange={(event) =>
              setName(
                event.target.value,
              )
            }
          />

          <button
            className="button primary full-button"
            disabled={busy}
          >
            <Plus size={16} />

            {busy
              ? "Creating..."
              : "Create workspace"}
          </button>
        </form>
      </Card>
    </>
  );
}
