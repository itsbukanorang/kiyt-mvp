"use client";

import {
  useState,
} from "react";

export default function LogoutButton() {
  const [
    busy,
    setBusy,
  ] = useState(false);

  async function logout() {
    if (busy) {
      return;
    }

    setBusy(true);

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
          "Sign out failed",
        );
      }

      window.location.replace("/");
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="underline underline-offset-4 disabled:opacity-50"
    >
      Logout
    </button>
  );
}
