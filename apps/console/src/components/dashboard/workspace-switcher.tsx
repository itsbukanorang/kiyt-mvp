"use client";

import {
  Box,
  Check,
  ChevronDown,
} from "lucide-react";

import {
  useEffect,
  useRef,
  useState,
} from "react";

type Workspace = {
  id: string;
  name: string;
  role:
    | "owner"
    | "admin"
    | "member";
};

export function WorkspaceSwitcher({
  activeWorkspaceName,
}: {
  activeWorkspaceName: string;
}) {
  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    activeId,
    setActiveId,
  ] = useState("");

  const [
    workspaces,
    setWorkspaces,
  ] = useState<Workspace[]>([]);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const root =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(
      event: MouseEvent,
    ) {
      if (
        root.current &&
        !root.current.contains(
          event.target as Node,
        )
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      close,
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        close,
      );
  }, []);

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
      return;
    }

    setWorkspaces(
      body.workspaces ?? [],
    );

    setActiveId(
      body.activeWorkspaceId ?? "",
    );
  }

  async function toggle() {
    const next =
      !open;

    setOpen(next);

    if (next) {
      await load();
    }
  }

  async function activate(
    workspaceId: string,
  ) {
    if (
      workspaceId === activeId ||
      busy
    ) {
      return;
    }

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

      if (!response.ok) {
        return;
      }

      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={root}
      className="workspace-switcher"
    >
      <button
        type="button"
        className="workspace-heading workspace-switcher-trigger"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="workspace-symbol">
          <Box size={18} />
        </span>

        <span className="workspace-switcher-copy">
          <strong>
            {activeWorkspaceName}
          </strong>

          <small>
            Private workspace
          </small>
        </span>

        <ChevronDown
          size={15}
          className={
            open
              ? "workspace-chevron open"
              : "workspace-chevron"
          }
        />
      </button>

      {open && (
        <div className="workspace-switcher-menu">
          <span className="workspace-switcher-label">
            SWITCH WORKSPACE
          </span>

          {workspaces.map(
            (workspace) => {
              const active =
                workspace.id ===
                activeId;

              return (
                <button
                  type="button"
                  key={workspace.id}
                  className={
                    active
                      ? "workspace-switcher-option active"
                      : "workspace-switcher-option"
                  }
                  disabled={busy}
                  onClick={() =>
                    activate(
                      workspace.id,
                    )
                  }
                >
                  <Box size={15} />

                  <span>
                    <strong>
                      {workspace.name}
                    </strong>

                    <small>
                      {workspace.role}
                    </small>
                  </span>

                  {active && (
                    <Check
                      size={14}
                    />
                  )}
                </button>
              );
            },
          )}

          <a
            href="/myaccount/workspaces"
            className="workspace-manage-link"
          >
            Manage workspaces
          </a>
        </div>
      )}
    </div>
  );
}
