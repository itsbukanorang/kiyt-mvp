"use client";

import Link from "next/link";

import {
  useMemo,
  useState,
} from "react";

import {
  Search,
} from "lucide-react";

import {
  StatusPill,
  formatActivityTokens,
  formatDate,
  formatNumber,
  shortId,
} from "@/components/dashboard/reporting-ui";

type RunRow = {
  id: string;
  status: string;
  decisionCount: number;
  observationCount: number;
  activityTokens: number;
  createdAt: string;
};

export default function RunsTableClient({
  items,
}: {
  items: RunRow[];
}) {
  const [
    query,
    setQuery,
  ] = useState("");

  const filtered =
    useMemo(() => {
      const q =
        query
          .trim()
          .toLowerCase();

      if (!q) {
        return items;
      }

      return items.filter(
        (run) =>
          run.id
            .toLowerCase()
            .includes(q)
          ||
          run.status
            .toLowerCase()
            .includes(q),
      );
    }, [
      items,
      query,
    ]);

  return (
    <>
      <div className="runs-table-toolbar">
        <div className="runs-table-search">
          <Search size={16} />

          <input
            type="search"
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
            placeholder="Search Run ID or status..."
            aria-label="Search runs"
          />
        </div>

        <span className="runs-table-count">
          {formatNumber(
            filtered.length,
          )}{" "}
          of{" "}
          {formatNumber(
            items.length,
          )}{" "}
          rows
        </span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Status</th>
              <th>Decision</th>
              <th>Observation</th>
              <th>Usage</th>
              <th>Created</th>
              <th>Detail</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="runs-table-empty"
                >
                  No matching runs.
                </td>
              </tr>
            ) : (
              filtered.map(
                (run) => (
                  <tr key={run.id}>
                    <td className="mono-cell">
                      {shortId(
                        run.id,
                      )}
                    </td>

                    <td>
                      <StatusPill
                        status={
                          run.status
                        }
                      />
                    </td>

                    <td>
                      {formatNumber(
                        run.decisionCount,
                      )}
                    </td>

                    <td>
                      {formatNumber(
                        run.observationCount,
                      )}
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
                        href={
                          `/myaccount/runs/${encodeURIComponent(
                            run.id,
                          )}`
                        }
                        className="text-link"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
