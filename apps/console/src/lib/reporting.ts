import {
  cookies,
  headers,
} from "next/headers";

import {
  redirect,
} from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

import {
  ACTIVE_COOKIE,
  getWorkspaceContext,
  requireMembership,
  type WorkspaceRole,
} from "@/lib/workspaces";

function asNumber(
  value: unknown,
) {
  const parsed = Number(
    value ?? 0,
  );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function asIso(
  value: unknown,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function publicRunStatus(
  status: string,
) {
  return status ===
    "awaiting_observation"
    ? "requires_action"
    : status;
}

export async function getReportingContext(): Promise<{
  userId: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
}> {
  const session =
    await auth.api.getSession({
      headers:
        await headers(),
    });

  if (!session) {
    redirect("/");
  }

  const store =
    await cookies();

  const context =
    await getWorkspaceContext(
      session.user.id,
      store.get(
        ACTIVE_COOKIE,
      )?.value,
    );

  const role =
    await requireMembership(
      session.user.id,
      context.active.id,
    );

  if (!role) {
    redirect("/");
  }

  return {
    userId:
      session.user.id,
    workspaceId:
      context.active.id,
    workspaceName:
      context.active.name,
    role,
  };
}

export type RunListItem = {
  id: string;
  objective: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  decisionCount: number;
  observationCount: number;
  totalTokens: number;
  activityTokens: number;
  providerName: string | null;
  model: string | null;
};

export async function listRuns(
  workspaceId: string,
  requestedLimit = 20,
  requestedOffset = 0,
) {
  const limit =
    Math.min(
      50,
      Math.max(
        1,
        Math.trunc(
          requestedLimit,
        ),
      ),
    );

  const offset =
    Math.min(
      100_000,
      Math.max(
        0,
        Math.trunc(
          requestedOffset,
        ),
      ),
    );

  const result =
    await db.query(
      `
        SELECT
          r.id,
          COALESCE(
            NULLIF(
              BTRIM(
                r.request_payload
                  ->> 'objective'
              ),
              ''
            ),
            'Untitled objective'
          ) AS objective,
          r.status,
          r.created_at,
          r.updated_at,
          r.completed_at,

          (
            SELECT COUNT(*)::bigint
            FROM decisions d
            WHERE d.run_id = r.id
              AND d.workspace_id =
                  r.workspace_id
          ) AS decision_count,

          (
            SELECT COUNT(*)::bigint
            FROM observations o
            WHERE o.run_id = r.id
              AND o.workspace_id =
                  r.workspace_id
          ) AS observation_count,

          COALESCE(
            (
              SELECT SUM(
                u.total_tokens
              )::bigint
              FROM usage_events u
              WHERE u.run_id = r.id
                AND u.workspace_id =
                    r.workspace_id
            ),
            0
          ) AS total_tokens,

          COALESCE(
              (
                SELECT
                  v.activity_tokens
                FROM
                  public.run_activity_token_usage_v1 v
                WHERE
                  v.run_id = r.id
                  AND v.workspace_id =
                      r.workspace_id
              ),
              0
            )::numeric
              AS activity_tokens,

            latest.provider_name,
          latest.model

        FROM runs r

        LEFT JOIN LATERAL (
          SELECT
            d.provider_name,
            d.model
          FROM decisions d
          WHERE d.run_id = r.id
            AND d.workspace_id =
                r.workspace_id
          ORDER BY
            d.sequence DESC
          LIMIT 1
        ) latest
          ON true

        WHERE r.workspace_id = $1

        ORDER BY
          r.created_at DESC,
          r.id DESC

        LIMIT $2
        OFFSET $3
      `,
      [
        workspaceId,
        limit + 1,
        offset,
      ],
    );

  const hasMore =
    result.rows.length >
    limit;

  const rows =
    result.rows.slice(
      0,
      limit,
    );

  const items: RunListItem[] =
    rows.map(
      (row) => ({
        id:
          String(row.id),
        objective:
          String(
            row.objective ??
              "Untitled objective",
          ),
        status:
          publicRunStatus(
            String(row.status),
          ),
        createdAt:
          asIso(
            row.created_at,
          ) ?? "",
        updatedAt:
          asIso(
            row.updated_at,
          ) ?? "",
        completedAt:
          asIso(
            row.completed_at,
          ),
        decisionCount:
          asNumber(
            row.decision_count,
          ),
        observationCount:
          asNumber(
            row.observation_count,
          ),
        totalTokens:
          asNumber(
            row.total_tokens,
          ),
        activityTokens:
            asNumber(
              row.activity_tokens,
            ),

        providerName:
          row.provider_name
            ? String(
                row.provider_name,
              )
            : null,
        model:
          row.model
            ? String(row.model)
            : null,
      }),
    );

  return {
    items,
    limit,
    offset,
    hasMore,
  };
}

export async function getRunDetail(
  workspaceId: string,
  runId: string,
) {
  if (
    !runId ||
    runId.length > 160
  ) {
    return null;
  }

  const runResult =
    await db.query(
      `
        SELECT
          id,
          COALESCE(
            NULLIF(
              BTRIM(
                request_payload
                  ->> 'objective'
              ),
              ''
            ),
            'Untitled objective'
          ) AS objective,
          status,
          error_code,
          error_retryable,
          created_at,
          updated_at,
          completed_at
        FROM runs
        WHERE id = $1
          AND workspace_id = $2
        LIMIT 1
      `,
      [
        runId,
        workspaceId,
      ],
    );

  if (
    runResult.rowCount !== 1
  ) {
    return null;
  }

  const [
    decisionsResult,
    observationsResult,
    operationsResult,
    evaluationResult,
    policyResult,
    usageResult,
  ] =
    await Promise.all([
      db.query(
        `
          SELECT
            d.id,
            d.sequence,
            d.decision_json
              ->> 'status'
                AS decision_status,
            d.decision_json
              #>> '{action,name}'
                AS action_name,
            d.decision_json
              ->> 'reason_summary'
                AS reason_summary,
            d.provider_name,
            d.model,
            d.reasoning_effort,
            d.created_at,

            COALESCE(
              at.activity_tokens,
              0
            )::numeric
              AS activity_tokens,

            COALESCE(
              SUM(
                u.input_tokens
              ),
              0
            )::bigint
              AS input_tokens,

            COALESCE(
              SUM(
                u.cached_input_tokens
              ),
              0
            )::bigint
              AS cached_input_tokens,

            COALESCE(
              SUM(
                u.output_tokens
              ),
              0
            )::bigint
              AS output_tokens,

            COALESCE(
              SUM(
                u.reasoning_tokens
              ),
              0
            )::bigint
              AS reasoning_tokens,

            COALESCE(
              SUM(
                u.total_tokens
              ),
              0
            )::bigint
              AS total_tokens

          FROM decisions d

          LEFT JOIN usage_events u
            ON u.decision_id = d.id
           AND u.workspace_id =
               d.workspace_id

          LEFT JOIN
            public.decision_activity_token_usage_v1 at
            ON at.decision_id = d.id
           AND at.run_id = d.run_id
           AND at.workspace_id =
               d.workspace_id

          WHERE d.run_id = $1
            AND d.workspace_id = $2

          GROUP BY
            d.id,
            d.sequence,
            d.decision_json,
            d.provider_name,
            d.model,
            d.reasoning_effort,
            d.created_at,
            at.activity_tokens

          ORDER BY
            d.sequence DESC

          LIMIT 50
        `,
        [
          runId,
          workspaceId,
        ],
      ),

      db.query(
        `
          SELECT
            id,
            sequence,
            observation_json
              #>> '{result,status}'
                AS result_status,
            created_at
          FROM observations
          WHERE run_id = $1
            AND workspace_id = $2
          ORDER BY
            sequence DESC
          LIMIT 50
        `,
        [
          runId,
          workspaceId,
        ],
      ),

      db.query(
        `
          SELECT
            id,
            sequence,
            kind,
            status,
            attempt_count,
            max_attempts,
            last_error_code,
            last_error_retryable,
            started_at,
            completed_at,
            created_at,
            updated_at
          FROM operations
          WHERE run_id = $1
            AND workspace_id = $2
          ORDER BY
            sequence DESC
          LIMIT 50
        `,
        [
          runId,
          workspaceId,
        ],
      ),

      db.query(
        `
          SELECT
            id,
            decision_id,
            observation_id,
            evaluator_name,
            evaluator_version,
            evidence_class,
            score,
            passed,
            created_at
          FROM evaluation_events
          WHERE run_id = $1
            AND workspace_id = $2
          ORDER BY
            created_at DESC,
            id DESC
          LIMIT 20
        `,
        [
          runId,
          workspaceId,
        ],
      ),

      db.query(
        `
          SELECT
            decision_id,
            policy_name,
            policy_version,
            learner_name,
            learner_version,
            strategy,
            mode,
            snapshot_revision,
            history_count,
            created_at
          FROM policy_selections
          WHERE run_id = $1
            AND workspace_id = $2
          ORDER BY
            operation_sequence DESC,
            created_at DESC
          LIMIT 1
        `,
        [
          runId,
          workspaceId,
        ],
      ),

      db.query(
        `
          SELECT
            phase,

            SUM(
              input_tokens
            )::bigint
              AS input_tokens,

            SUM(
              cached_input_tokens
            )::bigint
              AS cached_input_tokens,

            SUM(
              output_tokens
            )::bigint
              AS output_tokens,

            SUM(
              reasoning_tokens
            )::bigint
              AS reasoning_tokens,

            SUM(
              total_tokens
            )::bigint
              AS total_tokens

          FROM usage_events

          WHERE run_id = $1
            AND workspace_id = $2

          GROUP BY phase

          ORDER BY phase
        `,
        [
          runId,
          workspaceId,
        ],
      ),
    ]);

  const row =
    runResult.rows[0];

  const runAtResult =
    await db.query(
      `
        SELECT
          activity_tokens
        FROM
          public.run_activity_token_usage_v1
        WHERE
          run_id = $1
          AND workspace_id = $2
        LIMIT 1
      `,
      [
        runId,
        workspaceId,
      ],
    );

  const runActivityTokens =
    runAtResult.rowCount === 1
      ? asNumber(
          runAtResult.rows[0]
            .activity_tokens,
        )
      : 0;

  return {
    id:
      String(row.id),

    objective:
      String(row.objective),

    activityTokens:
      runActivityTokens,

    status:
      publicRunStatus(
        String(row.status),
      ),

    error:
      row.error_code
        ? {
            code:
              String(
                row.error_code,
              ),
            retryable:
              Boolean(
                row.error_retryable,
              ),
          }
        : null,

    createdAt:
      asIso(
        row.created_at,
      ) ?? "",

    updatedAt:
      asIso(
        row.updated_at,
      ) ?? "",

    completedAt:
      asIso(
        row.completed_at,
      ),

    decisions:
      decisionsResult.rows.map(
        (item) => ({
          id:
            String(item.id),
          sequence:
            asNumber(
              item.sequence,
            ),
          status:
            item.decision_status
              ? publicRunStatus(
                  String(
                    item.decision_status,
                  ),
                )
              : null,
          actionName:
            item.action_name
              ? String(
                  item.action_name,
                )
              : null,
          reasonSummary:
            item.reason_summary
              ? String(
                  item.reason_summary,
                )
              : null,
          providerName:
            String(
              item.provider_name,
            ),
          model:
            String(item.model),
          reasoningEffort:
            String(
              item.reasoning_effort,
            ),
          activityTokens:
            asNumber(
              item.activity_tokens,
            ),
          inputTokens:
            asNumber(
              item.input_tokens,
            ),
          cachedInputTokens:
            asNumber(
              item.cached_input_tokens,
            ),
          outputTokens:
            asNumber(
              item.output_tokens,
            ),
          reasoningTokens:
            asNumber(
              item.reasoning_tokens,
            ),
          totalTokens:
            asNumber(
              item.total_tokens,
            ),
          createdAt:
            asIso(
              item.created_at,
            ) ?? "",
        }),
      ),

    observations:
      observationsResult.rows.map(
        (item) => ({
          id:
            String(item.id),
          sequence:
            asNumber(
              item.sequence,
            ),
          resultStatus:
            item.result_status
              ? String(
                  item.result_status,
                )
              : "unknown",
          createdAt:
            asIso(
              item.created_at,
            ) ?? "",
        }),
      ),

    operations:
      operationsResult.rows.map(
        (item) => ({
          id:
            String(item.id),
          sequence:
            asNumber(
              item.sequence,
            ),
          kind:
            String(item.kind),
          status:
            String(item.status),
          attemptCount:
            asNumber(
              item.attempt_count,
            ),
          maxAttempts:
            asNumber(
              item.max_attempts,
            ),
          lastErrorCode:
            item.last_error_code
              ? String(
                  item.last_error_code,
                )
              : null,
          lastErrorRetryable:
            item.last_error_retryable ===
              null ||
            item.last_error_retryable ===
              undefined
              ? null
              : Boolean(
                  item.last_error_retryable,
                ),
          startedAt:
            asIso(
              item.started_at,
            ),
          completedAt:
            asIso(
              item.completed_at,
            ),
          createdAt:
            asIso(
              item.created_at,
            ) ?? "",
          updatedAt:
            asIso(
              item.updated_at,
            ) ?? "",
        }),
      ),

    evaluations:
      evaluationResult.rows.map(
        (item) => ({
          id:
            String(item.id),
          decisionId:
            String(
              item.decision_id,
            ),
          observationId:
            String(
              item.observation_id,
            ),
          evaluatorName:
            String(
              item.evaluator_name,
            ),
          evaluatorVersion:
            String(
              item.evaluator_version,
            ),
          evidenceClass:
            String(
              item.evidence_class,
            ),
          score:
            Number(item.score),
          passed:
            Boolean(
              item.passed,
            ),
          createdAt:
            asIso(
              item.created_at,
            ) ?? "",
        }),
      ),

    policy:
      policyResult.rowCount === 1
        ? {
            decisionId:
              String(
                policyResult
                  .rows[0]
                  .decision_id,
              ),
            policyName:
              String(
                policyResult
                  .rows[0]
                  .policy_name,
              ),
            policyVersion:
              String(
                policyResult
                  .rows[0]
                  .policy_version,
              ),
            learnerName:
              String(
                policyResult
                  .rows[0]
                  .learner_name,
              ),
            learnerVersion:
              String(
                policyResult
                  .rows[0]
                  .learner_version,
              ),
            strategy:
              String(
                policyResult
                  .rows[0]
                  .strategy,
              ),
            mode:
              String(
                policyResult
                  .rows[0]
                  .mode,
              ),
            snapshotRevision:
              asNumber(
                policyResult
                  .rows[0]
                  .snapshot_revision,
              ),
            historyCount:
              asNumber(
                policyResult
                  .rows[0]
                  .history_count,
              ),
            createdAt:
              asIso(
                policyResult
                  .rows[0]
                  .created_at,
              ) ?? "",
          }
        : null,

    usage:
      usageResult.rows.map(
        (item) => ({
          phase:
            String(item.phase),
          inputTokens:
            asNumber(
              item.input_tokens,
            ),
          cachedInputTokens:
            asNumber(
              item.cached_input_tokens,
            ),
          outputTokens:
            asNumber(
              item.output_tokens,
            ),
          reasoningTokens:
            asNumber(
              item.reasoning_tokens,
            ),
          totalTokens:
            asNumber(
              item.total_tokens,
            ),
        }),
      ),
  };
}

export async function getUsageSummary(
  workspaceId: string,
  days = 30,
) {
  const safeDays =
    Math.min(
      365,
      Math.max(
        1,
        Math.trunc(days),
      ),
    );

  const periodStart =
    new Date(
      Date.now() -
        safeDays *
          24 *
          60 *
          60 *
          1000,
    );

  const [
    runResult,
    usageResult,
    phaseResult,
    providerResult,
  ] =
    await Promise.all([
      db.query(
        `
          SELECT
            COUNT(*)::bigint
              AS all_time_runs,

            COUNT(*) FILTER (
              WHERE created_at >= $2
            )::bigint
              AS period_runs,

            COUNT(*) FILTER (
              WHERE status IN (
                'queued',
                'running'
              )
            )::bigint
              AS in_progress

          FROM runs

          WHERE workspace_id = $1
        `,
        [
          workspaceId,
          periodStart,
        ],
      ),

      db.query(
        `
          SELECT
            COUNT(*)::bigint
              AS usage_events,

            COUNT(
              DISTINCT decision_id
            )::bigint
              AS decisions,

            COALESCE(
              SUM(input_tokens),
              0
            )::bigint
              AS input_tokens,

            COALESCE(
              SUM(
                cached_input_tokens
              ),
              0
            )::bigint
              AS cached_input_tokens,

            COALESCE(
              SUM(output_tokens),
              0
            )::bigint
              AS output_tokens,

            COALESCE(
              SUM(reasoning_tokens),
              0
            )::bigint
              AS reasoning_tokens,

            COALESCE(
              SUM(total_tokens),
              0
            )::bigint
              AS total_tokens

          FROM usage_events

          WHERE workspace_id = $1
            AND created_at >= $2
        `,
        [
          workspaceId,
          periodStart,
        ],
      ),

      db.query(
        `
          SELECT
            phase,

            COUNT(*)::bigint
              AS events,

            COALESCE(
              SUM(total_tokens),
              0
            )::bigint
              AS total_tokens

          FROM usage_events

          WHERE workspace_id = $1
            AND created_at >= $2

          GROUP BY phase

          ORDER BY phase
        `,
        [
          workspaceId,
          periodStart,
        ],
      ),

      db.query(
        `
          SELECT
            d.provider_name,
            d.model,

            COUNT(
              DISTINCT u.decision_id
            )::bigint
              AS decisions,

            COUNT(*)::bigint
              AS usage_events,

            COALESCE(
              SUM(
                u.total_tokens
              ),
              0
            )::bigint
              AS total_tokens

          FROM usage_events u

          JOIN decisions d
            ON d.id =
               u.decision_id
           AND d.workspace_id =
               u.workspace_id

          WHERE u.workspace_id = $1
            AND u.created_at >= $2

          GROUP BY
            d.provider_name,
            d.model

          ORDER BY
            total_tokens DESC,
            d.provider_name,
            d.model

          LIMIT 20
        `,
        [
          workspaceId,
          periodStart,
        ],
      ),
    ]);

  const runs =
    runResult.rows[0];

  const usage =
    usageResult.rows[0];

  return {
    periodDays:
      safeDays,

    periodStart:
      periodStart.toISOString(),

    allTimeRuns:
      asNumber(
        runs.all_time_runs,
      ),

    periodRuns:
      asNumber(
        runs.period_runs,
      ),

    inProgress:
      asNumber(
        runs.in_progress,
      ),

    usageEvents:
      asNumber(
        usage.usage_events,
      ),

    decisions:
      asNumber(
        usage.decisions,
      ),

    inputTokens:
      asNumber(
        usage.input_tokens,
      ),

    cachedInputTokens:
      asNumber(
        usage.cached_input_tokens,
      ),

    outputTokens:
      asNumber(
        usage.output_tokens,
      ),

    reasoningTokens:
      asNumber(
        usage.reasoning_tokens,
      ),

    totalTokens:
      asNumber(
        usage.total_tokens,
      ),

    phases:
      phaseResult.rows.map(
        (item) => ({
          phase:
            String(item.phase),
          events:
            asNumber(
              item.events,
            ),
          totalTokens:
            asNumber(
              item.total_tokens,
            ),
        }),
      ),

    providers:
      providerResult.rows.map(
        (item) => ({
          providerName:
            String(
              item.provider_name,
            ),
          model:
            String(item.model),
          decisions:
            asNumber(
              item.decisions,
            ),
          usageEvents:
            asNumber(
              item.usage_events,
            ),
          totalTokens:
            asNumber(
              item.total_tokens,
            ),
        }),
      ),

    billing: {
      pricingConfigured:
        false,
      currency:
        null,
      customerCost:
        null,
      invoiceDataAvailable:
        false,
    },
  };
}


export async function getActivityTokenSummary(
  workspaceId: string,
  requestedDays = 30,
) {
  const days =
    Math.min(
      365,
      Math.max(
        1,
        Math.trunc(requestedDays),
      ),
    );

  const result =
    await db.query(
      `
        SELECT
          COALESCE(
            SUM(v.activity_tokens)
            FILTER (
              WHERE
                r.created_at >=
                now()
                - ($2::int * interval '1 day')
            ),
            0
          )::numeric
            AS period_activity_tokens,

          COALESCE(
            SUM(v.activity_tokens)
            FILTER (
              WHERE
                r.created_at >=
                (
                  date_trunc(
                    'day',
                    now()
                    AT TIME ZONE
                      'Asia/Jakarta'
                  )
                  AT TIME ZONE
                    'Asia/Jakarta'
                )
            ),
            0
          )::numeric
            AS today_activity_tokens

        FROM
          public.run_activity_token_usage_v1 v

        JOIN runs r
          ON r.id = v.run_id
         AND r.workspace_id =
             v.workspace_id

        WHERE
          v.workspace_id = $1
      `,
      [
        workspaceId,
        days,
      ],
    );

  const row =
    result.rows[0] ?? {};

  return {
    days,
    periodActivityTokens:
      Number(
        row.period_activity_tokens
        ?? 0,
      ),
    todayActivityTokens:
      Number(
        row.today_activity_tokens
        ?? 0,
      ),
  };
}


export async function getActivityTokenBalance(
  workspaceId: string,
) {
  const result =
    await db.query(
      `
        SELECT
          billing_started_at,
          credited_at,
          consumed_at,
          available_balance_at
        FROM
          public.workspace_at_balance_v1
        WHERE
          workspace_id = $1
        LIMIT 1
      `,
      [
        workspaceId,
      ],
    );

  const row =
    result.rows[0] ?? {};

  return {
    billingStartedAt:
      row.billing_started_at
        ? String(row.billing_started_at)
        : null,

    creditedAt:
      Number(
        row.credited_at
        ?? 0,
      ),

    consumedAt:
      Number(
        row.consumed_at
        ?? 0,
      ),

    availableBalanceAt:
      Number(
        row.available_balance_at
        ?? 0,
      ),
  };
}
