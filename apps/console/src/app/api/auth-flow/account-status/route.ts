import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(
  value: unknown,
) {
  if (typeof value !== "string") {
    return null;
  }

  const email =
    value.trim().toLowerCase();

  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(
      email,
    )
  ) {
    return null;
  }

  return email;
}

export async function POST(
  request: Request,
) {
  const origin =
    request.headers.get("origin");

  if (
    origin !==
    "https://console.kiyt.io"
  ) {
    return Response.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return Response.json(
      {
        error: "Invalid request",
      },
      {
        status: 400,
      },
    );
  }

  const email =
    normalizeEmail(
      (
        raw as {
          email?: unknown;
        }
      ).email,
    );

  if (!email) {
    return Response.json(
      {
        error: "Invalid email",
      },
      {
        status: 400,
      },
    );
  }

  const result =
    await db.query(
      `
        SELECT 1
        FROM "user"
        WHERE lower(email) = $1
        LIMIT 1
      `,
      [
        email,
      ],
    );

  return Response.json(
    {
      exists:
        result.rowCount === 1,
    },
    {
      headers: {
        "Cache-Control":
          "no-store, max-age=0",
      },
    },
  );
}
