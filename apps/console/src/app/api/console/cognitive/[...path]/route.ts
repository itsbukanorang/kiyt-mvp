import { cookies } from "next/headers";

import {
  mutationOriginAllowed,
  requireConsoleUser,
} from "@/lib/console-auth";

import {
  ACTIVE_COOKIE,
  getWorkspaceContext,
  requireMembership,
} from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

function targetFor(
  method: string,
  path: string[],
) {
  if (
    method === "POST" &&
    path.length === 1 &&
    path[0] === "runs"
  ) {
    return "/api/v1/runs";
  }

  if (
    method === "GET" &&
    path.length === 2 &&
    path[0] === "runs"
  ) {
    return `/api/v1/runs/${encodeURIComponent(path[1])}`;
  }

  if (
    method === "POST" &&
    path.length === 3 &&
    path[0] === "runs" &&
    (
      path[2] === "observations" ||
      path[2] === "inputs" ||
      path[2] === "feedback"
    )
  ) {
    return `/api/v1/runs/${encodeURIComponent(
      path[1],
    )}/${path[2]}`;
  }

  return null;
}

async function handle(
  request: Request,
  context: RouteContext,
) {
  if (
    request.method === "POST" &&
    !mutationOriginAllowed(request)
  ) {
    return Response.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const user =
    await requireConsoleUser(request);

  if (!user) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const store = await cookies();

  const workspaceContext =
    await getWorkspaceContext(
      user.id,
      store.get(ACTIVE_COOKIE)?.value,
    );

  const workspaceId =
    workspaceContext.active.id;

  const role =
    await requireMembership(
      user.id,
      workspaceId,
    );

  if (!role) {
    return Response.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const { path } =
    await context.params;

  const target =
    targetFor(
      request.method,
      path,
    );

  if (!target) {
    return Response.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  const gatewayUrl =
    process.env.KIYT_GATEWAY_URL
      ?.trim()
      .replace(/\/+$/, "");

  const gatewayToken =
    process.env
      .KIYT_CONSOLE_GATEWAY_TOKEN
      ?.trim();

  if (
    !gatewayUrl ||
    !gatewayToken
  ) {
    return Response.json(
      {
        error:
          "Cognitive gateway unavailable",
      },
      { status: 503 },
    );
  }

  const headers =
    new Headers();

  headers.set(
    "x-kiyt-console-token",
    gatewayToken,
  );

  headers.set(
    "x-kiyt-workspace-id",
    workspaceId,
  );

  const idempotencyKey =
    request.headers.get(
      "idempotency-key",
    );

  if (idempotencyKey) {
    headers.set(
      "idempotency-key",
      idempotencyKey,
    );
  }

  const contentType =
    request.headers.get(
      "content-type",
    );

  if (contentType) {
    headers.set(
      "content-type",
      contentType,
    );
  }

  try {
    const upstream =
      await fetch(
        `${gatewayUrl}${target}`,
        {
          method:
            request.method,
          headers,
          body:
            request.method === "POST"
              ? await request.text()
              : undefined,
          cache: "no-store",
        },
      );

    return new Response(
      await upstream.text(),
      {
        status:
          upstream.status,
        headers: {
          "content-type":
            upstream.headers.get(
              "content-type",
            ) ??
            "application/json",
          "cache-control":
            "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          "Cognitive gateway unavailable",
      },
      { status: 503 },
    );
  }
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  return handle(
    request,
    context,
  );
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  return handle(
    request,
    context,
  );
}
