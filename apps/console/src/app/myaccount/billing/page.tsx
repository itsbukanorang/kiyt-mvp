import {
  Badge,
  Card,
  EmptyState,
  PageTitle,
} from "@/components/dashboard/ui";

import {
  formatActivityTokenBalance,
  formatActivityTokens,
} from "@/components/dashboard/reporting-ui";

import {
  getActivityTokenBalance,
  getActivityTokenSummary,
  getReportingContext,
} from "@/lib/reporting";

export const dynamic =
  "force-dynamic";

export default async function Page() {
  const context =
    await getReportingContext();

  if (
    context.role !== "owner"
  ) {
    return (
      <>
        <PageTitle
          title="Billing"
          description="KIYT usage for your active workspace."
        />

        <Card>
          <EmptyState
            title="Owner access required"
            description="Billing is restricted to the workspace owner."
          />
        </Card>
      </>
    );
  }

  const [
    usage,
    balance,
  ] =
    await Promise.all([
      getActivityTokenSummary(
        context.workspaceId,
        30,
      ),
      getActivityTokenBalance(
        context.workspaceId,
      ),
    ]);

  return (
    <>
      <PageTitle
        title="Billing"
        description="Usage and Activity Tokens for your active workspace."
      />

      <Card className="billing-summary">
        <div>
          <span className="eyebrow">
            AVAILABLE BALANCE
          </span>

          <h2>
            {formatActivityTokenBalance(
              balance.availableBalanceAt,
            )}{" "}
            AT
          </h2>

          <p>
            Available Activity Tokens for your active workspace.
          </p>
        </div>

        <Badge tone="green">
          AT BALANCE
        </Badge>
      </Card>

      <div className="billing-grid">
        <Card className="billing-card">
          <span className="metric-label">
            Usage
          </span>

          <h2>
            {formatActivityTokens(
              usage.periodActivityTokens,
            )}{" "}
            AT
          </h2>

          <p>
            Last {usage.days} days
          </p>
        </Card>

        <Card className="billing-card">
          <span className="metric-label">
            Pricing
          </span>

          <h2>
            $5 / 1,000 AT
          </h2>

          <p>
            KIYT Activity Tokens
          </p>
        </Card>
      </div>
    </>
  );
}
