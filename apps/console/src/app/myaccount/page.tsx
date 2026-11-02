import {
  headers,
} from "next/headers";

import {
  redirect,
} from "next/navigation";

import { auth } from "@/lib/auth";

import LogoutButton from "./logout-button";

export const dynamic =
  "force-dynamic";

export default async function MyAccount() {
  const session =
    await auth.api.getSession({
      headers:
        await headers(),
    });

  if (!session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <p>
        Email :{" "}
        <strong>
          {session.user.email}
        </strong>{" "}
        Login Success{" "}
        <span className="ml-2">
          [
          <LogoutButton />
          ]
        </span>
      </p>
    </main>
  );
}
