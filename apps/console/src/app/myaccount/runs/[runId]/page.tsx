import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  Card,
  EmptyState,
  PageTitle,
} from "@/components/dashboard/ui";

import {
  StatusPill,
  formatActivityTokens,
  formatDate,
  formatNumber,
  shortId,
} from "@/components/dashboard/reporting-ui";

import {
  getReportingContext,
  getRunDetail,
} from "@/lib/reporting";

export const dynamic =
  "force-dynamic";

type PageProps = {
  params: Promise<{
    runId: string;
  }>;
};

export default async function Page({
  params,
}: PageProps) {
  const {
    runId,
  } =
    await params;

  const context =
    await getReportingContext();

  const run =
    await getRunDetail(
      context.workspaceId,
      runId,
    );

  if (!run) {
    notFound();
  }

  const latestDecision =
    run.decisions[0] ??
    null;

  return (
    <>
      <PageTitle
        title="Run detail"
        description="Durable lifecycle, decisions, observations, operations, and Activity Token usage for this run."
      >
        <Link
          href="/myaccount/runs"
          className="button secondary"
        >
          Back to runs
        </Link>
      </PageTitle>

      <Card className="run-hero">
        <div>
          <span className="eyebrow">
            RUN
          </span>

          <h2>
            {run.objective}
          </h2>

          <p className="mono-cell">
            {run.id}
          </p>
        </div>

        <StatusPill
          status={run.status}
        />
      </Card>

      <div className="detail-grid">
        <Card>
          <div className="panel-heading">
            <h2>
              Decision & action
            </h2>
          </div>

          {latestDecision ? (
            <div className="detail-list">
              <div className="detail-row">
                <span>
                  Decision
                </span>

                <strong className="mono-cell">
                  {shortId(
                    latestDecision.id,
                  )}
                </strong>
              </div>

              <div className="detail-row">
                <span>
                  Action
                </span>

                <strong>
                  {latestDecision.actionName ??
                    "No action"}
                </strong>
              </div>

              <div className="detail-row">
                <span>
                  Status
                </span>

                <strong>
                  {latestDecision.status ??
                    ""}
                </strong>
              </div>

              {latestDecision.reasonSummary && (
                <p className="detail-copy">
                  {
                    latestDecision.reasonSummary
                  }
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              kind="empty"
              title="No decision yet"
              description="This run has not persisted a structured decision."
            />
          )}
        </Card>

        <Card>
          <div className="panel-heading">
            <h2>
              Usage
            </h2>
          </div>

          <div className="detail-list">
            <div className="detail-row">
              <span>
                Activity Tokens
              </span>

              <strong>
                {formatActivityTokens(
                  run.activityTokens,
                )}{" "}
                AT
              </strong>
            </div>
          </div>
        </Card>

        <Card>
          <div className="panel-heading">
            <h2>
              Lifecycle
            </h2>
          </div>

          <div className="detail-list">
            <div className="detail-row">
              <span>
                Created
              </span>

              <strong>
                {formatDate(
                  run.createdAt,
                )}
              </strong>
            </div>

            <div className="detail-row">
              <span>
                Updated
              </span>

              <strong>
                {formatDate(
                  run.updatedAt,
                )}
              </strong>
            </div>

            <div className="detail-row">
              <span>
                Completed
              </span>

              <strong>
                {formatDate(
                  run.completedAt,
                )}
              </strong>
            </div>

            <div className="detail-row">
              <span>
                Decisions
              </span>

              <strong>
                {formatNumber(
                  run.decisions.length,
                )}
              </strong>
            </div>

            <div className="detail-row">
              <span>
                Observations
              </span>

              <strong>
                {formatNumber(
                  run.observations.length,
                )}
              </strong>
            </div>
          </div>
        </Card>

        <Card>
          <div className="panel-heading">
            <h2>
              Sanitized error
            </h2>
          </div>

          {run.error ? (
            <div className="detail-list">
              <div className="detail-row">
                <span>
                  Code
                </span>

                <strong className="mono-cell">
                  {run.error.code}
                </strong>
              </div>

              <div className="detail-row">
                <span>
                  Retryable
                </span>

                <strong>
                  {run.error.retryable
                    ? "Yes"
                    : "No"}
                </strong>
              </div>
            </div>
          ) : (
            <EmptyState
              kind="empty"
              title="No run error"
              description="No sanitized failure code is recorded for this run."
            />
          )}
        </Card>
      </div>

      <Card className="recent-panel">
        <div className="panel-heading">
          <h2>
            Decision history
          </h2>
        </div>

        {run.decisions.length === 0 ? (
          <EmptyState
            kind="empty"
            title="No decisions"
            description="No persisted decisions are available for this run."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Decision</th>
                  <th>Action</th>
                  <th>Usage</th>
                  <th>Created</th>
                </tr>
              </thead>

              <tbody>
                {run.decisions.map(
                  (decision) => (
                    <tr key={decision.id}>
                      <td>
                        #{decision.sequence}
                      </td>

                      <td className="mono-cell">
                        {shortId(
                          decision.id,
                        )}
                      </td>

                      <td>
                        {decision.actionName ??
                          "—"}
                      </td>

                      <td>
                        {formatActivityTokens(
                          decision.activityTokens,
                        )}{" "}
                        AT
                      </td>

                      <td>
                        {formatDate(
                          decision.createdAt,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="recent-panel">
        <div className="panel-heading">
          <h2>
            Execution observations
          </h2>
        </div>

        {run.observations.length === 0 ? (
          <EmptyState
            kind="empty"
            title="No observations"
            description="No customer execution result has been recorded for this run."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Observation</th>
                  <th>Result</th>
                  <th>Recorded</th>
                </tr>
              </thead>

              <tbody>
                {run.observations.map(
                  (observation) => (
                    <tr key={observation.id}>
                      <td>
                        #{observation.sequence}
                      </td>

                      <td className="mono-cell">
                        {shortId(
                          observation.id,
                        )}
                      </td>

                      <td>
                        <StatusPill
                          status={
                            observation.resultStatus
                          }
                        />
                      </td>

                      <td>
                        {formatDate(
                          observation.createdAt,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="recent-panel">
        <div className="panel-heading">
          <h2>
            Durable operations
          </h2>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sequence</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Started</th>
                <th>Completed</th>
              </tr>
            </thead>

            <tbody>
              {run.operations.map(
                (operation) => (
                  <tr key={operation.id}>
                    <td>
                      #{operation.sequence}
                    </td>

                    <td>
                      {operation.kind}
                    </td>

                    <td>
                      <StatusPill
                        status={
                          operation.status
                        }
                      />
                    </td>

                    <td>
                      {operation.attemptCount}
                      /
                      {operation.maxAttempts}
                    </td>

                    <td>
                      {formatDate(
                        operation.startedAt,
                      )}
                    </td>

                    <td>
                      {formatDate(
                        operation.completedAt,
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
