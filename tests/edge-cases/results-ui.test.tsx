// @vitest-environment jsdom

import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResultsTable } from "@/components/ResultsTable";

function buildRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `row_${index + 1}`,
  }));
}

describe("EDGE_CASES results UI", () => {
  it("paginates large result sets to 25 rows per page once they exceed 1,000 rows", () => {
    render(
      createElement(ResultsTable, {
        columns: ["id", "name"],
        executionTimeMs: 12,
        onDownload: vi.fn(),
        rowCount: 1_100,
        rows: buildRows(1_100),
      }),
    );

    expect(screen.getByText(/page 1 of 44/i)).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(26);
    expect(screen.getByText("row_1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByText(/page 2 of 44/i)).toBeInTheDocument();
    expect(screen.getByText("row_26")).toBeInTheDocument();
    expect(screen.queryByText("row_1")).not.toBeInTheDocument();
  });
});
