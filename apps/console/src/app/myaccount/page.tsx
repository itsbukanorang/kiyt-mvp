import Link from "next/link";

import {
  Activity,
  Coins,
  Layers,
} from "lucide-react";

import {
  Badge,
  Card,
  EmptyState,
  PageTitle,
} from "@/components/dashboard/ui";

import {
  MetricValue,
  StatusPill,
  formatActivityTokens,
  formatDate,
  formatNumber,
  shortId,
} from "@/components/dashboard/reporting-ui";

import {
  getActivityTokenSummary,
  getReportingContext,
  getUsageSummary,
  listRuns,
} from "@/lib/reporting";

export const dynamic =
  "force-dynamic";

export default async function Page() {
  const context =
    await getReportingContext();

  const [
    recent,
    usage,
    activityTokens,
  ] =
    await Promise.all([
      listRuns(
        context.workspaceId,
        5,
        0,
      ),
      getUsageSummary(
        context.workspaceId,
        30,
      ),
      getActivityTokenSummary(
        context.workspaceId,
        30,
      ),
    ]);

  return (
    <>
      <PageTitle
        eyebrow="YOUR COGNITIVE WORKSPACE"
        title="Overview"
        description="Live KIYT activity for your active workspace."
      >
        <Link
          href="/docs"
          className="button secondary"
        >
          Documentation
        </Link>
      </PageTitle>

      <div className="metrics-grid">
        <MetricValue
          label="Total Runs"
          value={formatNumber(
            usage.allTimeRuns,
          )}
          description="All cognitive runs"
          unit="Active workspace"
          icon={
            <Layers size={17} />
          }
        />

        <MetricValue
          label="In Progress"
          value={formatNumber(
            usage.inProgress,
          )}
          description="Runs currently active"
          unit="Current state"
          icon={
            <Activity size={17} />
          }
        />

        <MetricValue
          label="Today's Usage"
          value={`${formatActivityTokens(
            activityTokens.todayActivityTokens,
          )} AT`}
          description="KIYT Activity Tokens"
          unit="Today · Asia/Jakarta"
          icon={
            <Coins size={17} />
          }
        />
      </div>

      <Card className="recent-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent runs</h2>
            <p>
              Latest durable work for the active workspace.
            </p>
          </div>

          <Badge tone="green">
            LIVE DATA
          </Badge>
        </div>

        {recent.items.length === 0 ? (
          <EmptyState
            kind="empty"
            title="No runs yet"
            description="New cognitive runs will appear here after they are accepted by KIYT."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Objective</th>
                  <th>Run</th>
                  <th>Status</th>
                  <th>AT</th>
                  <th>Created</th>
                  <th>Detail</th>
                </tr>
              </thead>

              <tbody>
                {recent.items.map(
                  (run) => (
                    <tr key={run.id}>
                      <td className="objective-cell">
                        {run.objective}
                      </td>

                      <td className="mono-cell">
                        {shortId(run.id)}
                      </td>

                      <td>
                        <StatusPill
                          status={run.status}
                        />
                      </td>

                      <td>
                        {formatActivityTokens(
                          run.activityTokens,
                        )}{" "}
                        AT
                      </td>

                      <td>
                        {formatDate(
                          run.createdAt,
                        )}
                      </td>

                      <td>
                        <Link
                          className="text-link"
                          href={
                            `/myaccount/runs/${encodeURIComponent(
                              run.id,
                            )}`
                          }
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
