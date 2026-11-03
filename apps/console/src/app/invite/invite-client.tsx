"use client";

import {
  useEffect,
  useState,
} from "react";

export default function InviteClient() {
  const [token, setToken] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  useEffect(() => {
    setToken(
      window.location.hash
        .replace(/^#/, ""),
    );
  }, []);

  async function accept() {
    if (!token) {
      setMessage(
        "Invalid invite link.",
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response =
        await fetch(
          "/api/console/invites/accept",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                token,
              }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setMessage(
            "Sign in with the invited email, then open this invite link again.",
          );
          return;
        }

        throw new Error(
          body.error ||
          "Unable to accept invite",
        );
      }

      window.location.replace(
        "/myaccount/workspaces",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to accept invite",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07111d] text-white grid place-items-center p-6">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-[#0c1929] p-8">
        <p className="text-xs tracking-[0.2em] text-blue-300">
          KIYT WORKSPACE INVITE
        </p>

        <h1 className="mt-3 text-3xl font-semibold">
          Join workspace
        </h1>

        <p className="mt-3 text-sm text-slate-300">
          Sign in using the email address
          that received this invite.
        </p>

        {message && (
          <p className="mt-5 text-sm text-amber-200">
            {message}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={accept}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-3 font-medium"
        >
          {busy
            ? "Accepting..."
            : "Accept invite"}
        </button>

        <a
          href="/"
          className="mt-4 block text-center text-sm text-blue-300"
        >
          Sign in
        </a>
      </div>
    </main>
  );
}
