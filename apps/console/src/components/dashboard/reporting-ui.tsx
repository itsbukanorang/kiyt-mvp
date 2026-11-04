import type {
  ReactNode,
} from "react";

import {
  Card,
} from "@/components/dashboard/ui";

export function formatNumber(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-US",
  ).format(value);
}

export function formatActivityTokenBalance(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(value);
}

export function formatActivityTokens(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(value);
}

export function formatDate(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle:
        "medium",
      timeStyle:
        "short",
      timeZone:
        "Asia/Jakarta",
    },
  ).format(date);
}

export function shortId(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return "—";
  }

  if (value.length <= 20) {
    return value;
  }

  return `${value.slice(
    0,
    10,
  )}…${value.slice(-6)}`;
}

export function StatusPill({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  let tone =
    "active";

  if (
    normalized ===
    "completed" ||
    normalized ===
    "success"
  ) {
    tone = "success";
  } else if (
    normalized ===
      "failed" ||
    normalized ===
      "failure"
  ) {
    tone = "error";
  } else if (
    normalized ===
      "requires_action" ||
    normalized ===
      "needs_input"
  ) {
    tone =
      "attention";
  }

  return (
    <span
      className={
        `run-status ${tone}`
      }
    >
      {status.replace(
        /_/g,
        " ",
      )}
    </span>
  );
}

export function MetricValue({
  label,
  value,
  description,
  unit,
  icon,
}: {
  label: string;
  value: string;
  description: string;
  unit: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="metric metric-live">
      <div>
        <span>
          {label}
        </span>

        {icon}
      </div>

      <strong>
        {value}
      </strong>

      <p>
        {description}
      </p>

      <small>
        {unit}
      </small>
    </Card>
  );
}
