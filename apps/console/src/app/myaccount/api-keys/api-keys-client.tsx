"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  Ban,
  Check,
  Copy,
  KeyRound,
  Plus,
  ShieldCheck,
} from "lucide-react";

import {
  Badge,
  Card,
  EmptyState,
  PageTitle,
} from "@/components/dashboard/ui";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt:
    | string
    | null;
  revokedAt:
    | string
    | null;
};

export default function ApiKeysClient() {
  const [keys, setKeys] =
    useState<ApiKey[]>([]);

  const [
    workspaceName,
    setWorkspaceName,
  ] = useState("");

  const [role, setRole] =
    useState("");

  const [name, setName] =
    useState("Production");

  const [
    rawKey,
    setRawKey,
  ] =
    useState<string | null>(
      null,
    );

  const [copied, setCopied] =
    useState(false);

  
  const [
    copyWarningOpen,
    setCopyWarningOpen,
  ] = useState(false);

  const [
    hideCountdown,
    setHideCountdown,
  ] = useState(5);

const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [
    keyFilter,
    setKeyFilter,
  ] = useState<
    "active" |
    "revoked" |
    "all"
  >("active");

  async function load() {
    const response =
      await fetch(
        "/api/console/api-keys",
        {
          cache: "no-store",
        },
      );

    const body =
      await response.json();

    if (!response.ok) {
      throw new Error(
        body.error ||
        "Unable to load API keys",
      );
    }

    setKeys(
      body.keys ?? [],
    );

    setWorkspaceName(
      body.workspace?.name ??
        "",
    );

    setRole(
      body.workspace?.role ??
        "",
    );
  }

  useEffect(() => {
    load()
      .catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load API keys",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // KEY_HIDE_COUNTDOWN_V3
  useEffect(() => {
    if (!copyWarningOpen) {
      return;
    }

    setHideCountdown(60);

    const startedAt =
      Date.now();

    const interval =
      window.setInterval(() => {
        const elapsed =
          Date.now() - startedAt;

        const remaining =
          Math.max(
            0,
            60 -
              Math.floor(
                elapsed / 1000,
              ),
          );

        setHideCountdown(
          remaining,
        );
      }, 250);

    const timeout =
      window.setTimeout(() => {
        setHideCountdown(0);
        setRawKey(null);
        setCopied(false);
        setCopyWarningOpen(false);
      }, 60000);

    return () => {
      window.clearInterval(
        interval,
      );

      window.clearTimeout(
        timeout,
      );
    };
  }, [copyWarningOpen]);

  async function create(
    event: FormEvent,
  ) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setRawKey(null);
    setCopied(false);

    try {
      const response =
        await fetch(
          "/api/console/api-keys",
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
          "Unable to create API key",
        );
      }

      setRawKey(
        body.key,
      );

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create API key",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(
    id: string,
  ) {
    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/console/api-keys/${id}`,
          {
            method: "DELETE",
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Unable to revoke API key",
        );
      }

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to revoke API key",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (
      !rawKey ||
      copyWarningOpen
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        rawKey,
      );

      setCopied(true);
      setHideCountdown(60);
      setCopyWarningOpen(true);
    } catch {
      setError(
        "Unable to copy the key. Copy it manually before leaving this page.",
      );
    }
  }

  function closeKeyModal() {
    setHideCountdown(0);

    // Closing is final:
    // remove the full key from UI memory.
    setRawKey(null);
    setCopied(false);
    setCopyWarningOpen(false);
  }

  const activeCount =
    keys.filter(
      (key) => !key.revokedAt,
    ).length;

  const revokedCount =
    keys.filter(
      (key) => Boolean(
        key.revokedAt,
      ),
    ).length;

  const filteredKeys =
    keys.filter((key) => {
      if (
        keyFilter === "active"
      ) {
        return !key.revokedAt;
      }

      if (
        keyFilter === "revoked"
      ) {
        return Boolean(
          key.revokedAt,
        );
      }

      return true;
    });

  const canManage =
    role === "owner" ||
    role === "admin";

  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE CREDENTIALS"
        title="API Keys"
        description="Create and manage credentials for the active workspace."
      >
        <Badge tone="blue">
          {activeCount} ACTIVE
        </Badge>
      </PageTitle>

      <div className="api-key-workspace-strip">
        <div>
          <ShieldCheck size={17} />

          <span>
            Active workspace
          </span>

          <strong>
            {workspaceName ||
              "—"}
          </strong>
        </div>

        <Badge>
          {role
            ? role.toUpperCase()
            : "—"}
        </Badge>
      </div>

      {error && (
        <div
          className="notice"
          role="alert"
        >
          <Ban size={18} />
          <p>{error}</p>
        </div>
      )}

      {rawKey && (
        <Card className="api-key-reveal">
          <div className="panel-heading">
            <div>
              <Badge tone="green">
                <Check size={11} />
                CREATED
              </Badge>

              <h2>
                Copy your API key
              </h2>

              <p>
                This is the only time
                the complete key will
                be shown.
              </p>
            </div>

            <KeyRound size={20} />
          </div>

          <div className="api-key-secret">
            <code>
              {rawKey}
            </code>

            <button
              type="button"
              className="button secondary"
              onClick={copyKey}
            >
              {copied ? (
                <>
                  <Check size={15} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={15} />
                  Copy key
                </>
              )}
            </button>
          </div>
        </Card>
      )}

      {copyWarningOpen &&
        rawKey && (
          <div
            className="api-key-modal-backdrop"
            role="presentation"
          >
            <div
              className="api-key-safety-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="api-key-safety-title"
            >
              <button
                type="button"
                className="api-key-modal-close"
                aria-label="Close and hide API key"
                title="Close and hide key"
                onClick={closeKeyModal}
              >
                ×
              </button>

              <div className="api-key-modal-icon">
                <ShieldCheck
                  size={24}
                />
              </div>

              <Badge tone="green">
                <Check size={11} />
                KEY COPIED
              </Badge>

              <h2 id="api-key-safety-title">
                Paste your key in a
                safe environment.
              </h2>

              <p className="api-key-modal-copy">
                Save it in your secret
                manager or secure
                environment now.
                KIYT will never show
                this full key again.
              </p>

              <div className="api-key-modal-secret">
                <code>
                  {rawKey}
                </code>
              </div>

              <div className="api-key-countdown">
                <strong>
                  {hideCountdown}
                </strong>

                <span>
                  seconds until this key
                  is automatically hidden
                </span>
              </div>
            </div>
          </div>
        )}

      {canManage && (
        <Card className="form-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Create API key
              </h2>

              <p>
                Keys are scoped only
                to the active workspace.
              </p>
            </div>

            <Plus size={18} />
          </div>

          <form
            onSubmit={create}
            className="api-key-create-form"
          >
            <label htmlFor="key-name">
              Key name
              <span>
                1–80 characters
              </span>
            </label>

            <input
              id="key-name"
              className="workspace-input"
              value={name}
              maxLength={80}
              required
              placeholder="e.g. Production"
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
              <KeyRound size={16} />

              {busy
                ? "Creating..."
                : "Create API key"}
            </button>
          </form>
        </Card>
      )}

      <Card className="recent-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Workspace keys
            </h2>

            <p>
              Credentials issued for
              {workspaceName
                ? ` ${workspaceName}`
                : " this workspace"}.
            </p>
          </div>

          <Badge>
            {keys.length} KEY
            {keys.length === 1
              ? ""
              : "S"}
          </Badge>
        </div>

        <div
          className="api-key-filter"
          role="group"
          aria-label="Filter API keys"
        >
          <button
            type="button"
            className={
              keyFilter === "active"
                ? "api-key-filter-button active"
                : "api-key-filter-button"
            }
            aria-pressed={
              keyFilter === "active"
            }
            onClick={() =>
              setKeyFilter(
                "active",
              )
            }
          >
            Active
            <span>
              {activeCount}
            </span>
          </button>

          <button
            type="button"
            className={
              keyFilter === "revoked"
                ? "api-key-filter-button active"
                : "api-key-filter-button"
            }
            aria-pressed={
              keyFilter === "revoked"
            }
            onClick={() =>
              setKeyFilter(
                "revoked",
              )
            }
          >
            Revoked
            <span>
              {revokedCount}
            </span>
          </button>

          <button
            type="button"
            className={
              keyFilter === "all"
                ? "api-key-filter-button active"
                : "api-key-filter-button"
            }
            aria-pressed={
              keyFilter === "all"
            }
            onClick={() =>
              setKeyFilter(
                "all",
              )
            }
          >
            All
            <span>
              {keys.length}
            </span>
          </button>
        </div>

        {loading ? (
          <EmptyState
            kind="loading"
            title="Loading API keys"
            description="Reading credentials for the active workspace."
          />
        ) : filteredKeys.length === 0 ? (
          <EmptyState
            kind="empty"
            title={
              keyFilter === "active"
                ? "No active API keys"
                : keyFilter === "revoked"
                ? "No revoked API keys"
                : "No API keys yet"
            }
            description={
              keyFilter === "active"
                ? "Create a key to authenticate requests from your application."
                : keyFilter === "revoked"
                ? "Revoked credentials will appear here."
                : "No credentials have been created for this workspace."
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Status</th>
                  <th>Last used</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredKeys.map(
                  (key) => (
                    <tr key={key.id}>
                      <td>
                        <div className="api-key-name">
                          <span className="workspace-symbol">
                            <KeyRound
                              size={15}
                            />
                          </span>

                          <strong>
                            {key.name}
                          </strong>
                        </div>
                      </td>

                      <td>
                        <code className="api-key-prefix">
                          {key.prefix}
                          ••••••••
                        </code>
                      </td>

                      <td>
                        {key.revokedAt ? (
                          <Badge tone="neutral">
                            REVOKED
                          </Badge>
                        ) : (
                          <Badge tone="green">
                            <Check size={11} />
                            ACTIVE
                          </Badge>
                        )}
                      </td>

                      <td>
                        <span className="workspace-muted">
                          {key.lastUsedAt
                            ? new Date(
                                key.lastUsedAt,
                              ).toLocaleString()
                            : "Never"}
                        </span>
                      </td>

                      <td>
                        {!key.revokedAt ? (
                          canManage ? (
                            <button
                              type="button"
                              className="button secondary"
                              disabled={busy}
                              onClick={() =>
                                revoke(
                                  key.id,
                                )
                              }
                            >
                              <Ban size={14} />
                              Revoke
                            </button>
                          ) : (
                            <span className="workspace-muted">
                              —
                            </span>
                          )
                        ) : (
                          <span className="workspace-muted">
                            Revoked
                          </span>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
