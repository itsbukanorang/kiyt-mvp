"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  WorkspaceSwitcher,
} from "@/components/dashboard/workspace-switcher";

import {
  Home,
  Terminal,
  Layers,
  KeyRound,
  ReceiptText,
  BookOpen,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Box,
  ArrowUpRight,
} from "lucide-react";

const navigation = [
  {
    name: "Overview",
    path: "",
    icon: Home,
  },
  {
    name: "Workspaces",
    path: "/workspaces",
    icon: Box,
  },
  {
    name: "Playground",
    path: "/playground",
    icon: Terminal,
  },
  {
    name: "Runs",
    path: "/runs",
    icon: Layers,
  },
  {
    name: "API Keys",
    path: "/api-keys",
    icon: KeyRound,
  },
  {
    name: "Billing",
    path: "/billing",
    icon: ReceiptText,
  },
  {
    name: "Documentation",
    path: "/docs",
    icon: BookOpen,
  },
];

export function ConsoleShell({
  children,
  userName,
  userEmail,
  activeWorkspaceName,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  activeWorkspaceName: string;
}) {
  const pathname = usePathname();

  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const [signingOut, setSigningOut] =
    useState(false);

  const drawer =
    useRef<HTMLDialogElement>(null);

  const menuButton =
    useRef<HTMLButtonElement>(null);

  const base = "/myaccount";

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (drawerOpen) {
      if (!drawer.current?.open) {
        drawer.current?.showModal();
      }

      return;
    }

    if (drawer.current?.open) {
      drawer.current.close();
    }
  }, [drawerOpen]);

  function hrefFor(path: string) {
    if (path === "/docs") {
      return "/docs";
    }

    return `${base}${path}`;
  }

  const current =
    navigation.find((item) => {
      if (item.path === "") {
        return pathname === base;
      }

      if (item.path === "/docs") {
        return pathname.startsWith("/docs");
      }

      return (
        pathname === `${base}${item.path}` ||
        pathname.startsWith(
          `${base}${item.path}/`,
        )
      );
    })?.name ?? "Overview";

  async function logout() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);

    try {
      const response =
        await fetch(
          "/api/auth/sign-out",
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: "{}",
          },
        );

      if (!response.ok) {
        throw new Error(
          "Logout failed",
        );
      }

      window.location.replace("/");
    } catch {
      setSigningOut(false);
    }
  }

  const sidebar = (
    <>
      <Link
        href="/myaccount"
        className="brand"
      >
        <img
          src="/dashboard-assets/kiyt-logo.png"
          alt="KIYT"
          width="96"
          height="36"
        />

        <span>Console</span>
      </Link>

      <WorkspaceSwitcher
        activeWorkspaceName={
          activeWorkspaceName
        }
      />

      <span className="nav-caption">
        WORKSPACE
      </span>

      <nav aria-label="Console navigation">
        {navigation.map(
          ({
            name,
            path,
            icon: Icon,
          }) => {
            const href =
              hrefFor(path);

            const active =
              name === current;

            return (
              <Link
                key={name}
                href={href}
                className={
                  active
                    ? "active"
                    : ""
                }
                aria-current={
                  active
                    ? "page"
                    : undefined
                }
              >
                <Icon size={18} />

                <span>
                  {name}
                </span>

                {active && <i />}
              </Link>
            );
          },
        )}
      </nav>

      <div className="sidebar-help">
        <BookOpen size={19} />

        <h3>
          From decision to action.
        </h3>

        <p>
          KIYT decides.
          <br />
          Your application executes.
        </p>

        <Link href="/docs">
          Read the integration guide
          <ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="member">
        <span className="member-icon">
          <Box size={17} />
        </span>

        <div>
          <strong>
            {userName}
          </strong>

          <small>
            {userEmail}
          </small>
        </div>
      </div>

      <button
        type="button"
        className="logout"
        disabled={signingOut}
        onClick={logout}
      >
        <LogOut size={16} />

        {signingOut
          ? "Logging out..."
          : "Logout"}
      </button>
    </>
  );

  return (
    <div className="console-shell">
      <a
        className="skip-link"
        href="#content"
      >
        Skip to content
      </a>

      <aside className="sidebar">
        {sidebar}
      </aside>

      <dialog
        ref={drawer}
        className="drawer"
        onCancel={() =>
          setDrawerOpen(false)
        }
        onClose={() => {
          setDrawerOpen(false);
          menuButton.current?.focus();
        }}
      >
        <button
          type="button"
          className="icon-button drawer-close"
          aria-label="Close navigation"
          onClick={() =>
            setDrawerOpen(false)
          }
        >
          <X size={20} />
        </button>

        {sidebar}
      </dialog>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              ref={menuButton}
              type="button"
              className="icon-button menu-button"
              aria-label="Open navigation"
              onClick={() =>
                setDrawerOpen(true)
              }
            >
              <Menu size={21} />
            </button>

            <span className="breadcrumb-parent">
              Console
            </span>

            <ChevronRight size={13} />

            <span>
              {current}
            </span>
          </div>

          <span className="preview-label">
            <i />
            {activeWorkspaceName}
          </span>
        </header>

        <main
          id="content"
          tabIndex={-1}
        >
          {children}
        </main>

        <footer className="site-footer">
          <span>
            © 2026 KIYT
          </span>

          <span>
            Human-inspired. Built to evolve.
          </span>
        </footer>
      </div>
    </div>
  );
}
