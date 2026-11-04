import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
  PageTitle,
} from "@/components/dashboard/ui";

import {
  getReportingContext,
  listRuns,
} from "@/lib/reporting";

import RunsTableClient from "./runs-table-client";

export const dynamic =
  "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    page?: string;
  }>;
};

export default async function Page({
  searchParams,
}: PageProps) {
  const params =
    await searchParams;

  const rawPage =
    Number.parseInt(
      params.page ?? "1",
      10,
    );

  const page =
    Number.isFinite(rawPage)
      ? Math.max(
          1,
          Math.min(
            5000,
            rawPage,
          ),
        )
      : 1;

  const limit = 20;

  const context =
    await getReportingContext();

  const result =
    await listRuns(
      context.workspaceId,
      limit,
      (page - 1) * limit,
    );

  return (
    <>
      <PageTitle
        title="Runs"
        description="Track durable KIYT runs and Activity Token usage for your active workspace."
      />

      <Card>
        <div className="panel-heading">
          <div>
            <h2>
              Run history
            </h2>

            <p>
              Search and review durable runs in the active workspace.
            </p>
          </div>

          <Badge tone="green">
            LIVE DATA
          </Badge>
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            kind="empty"
            title="No runs found"
            description="This workspace does not have runs for this page."
          />
        ) : (
          <RunsTableClient
            items={
              result.items.map(
                (run) => ({
                  id: run.id,
                  status:
                    run.status,
                  decisionCount:
                    run.decisionCount,
                  observationCount:
                    run.observationCount,
                  activityTokens:
                    run.activityTokens,
                  createdAt:
                    run.createdAt,
                }),
              )
            }
          />
        )}

        <div className="pagination">
          <span>
            Page {page} · limit{" "}
            {limit}
          </span>

          <div>
            {page > 1 ? (
              <Link
                href={
                  `/myaccount/runs?page=${
                    page - 1
                  }`
                }
                className="pagination-link"
              >
                Previous
              </Link>
            ) : (
              <span className="pagination-link disabled">
                Previous
              </span>
            )}

            {result.hasMore ? (
              <Link
                href={
                  `/myaccount/runs?page=${
                    page + 1
                  }`
                }
                className="pagination-link"
              >
                Next
              </Link>
            ) : (
              <span className="pagination-link disabled">
                Next
              </span>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
