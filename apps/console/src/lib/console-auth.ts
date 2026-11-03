import { auth } from "@/lib/auth";

export async function requireConsoleUser(
  request: Request,
) {
  const session =
    await auth.api.getSession({
      headers:
        request.headers,
    });

  if (!session) {
    return null;
  }

  return session.user;
}

export function mutationOriginAllowed(
  request: Request,
) {
  const origin =
    request.headers.get(
      "origin",
    );

  const expected =
    process.env.BETTER_AUTH_URL ??
    "https://console.kiyt.io";

  return origin === expected;
}
