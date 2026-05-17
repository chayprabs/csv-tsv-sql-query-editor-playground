// @vitest-environment jsdom

import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResultsTable } from "@/components/ResultsTable";

const resultRows = [
  { department: "Engineering", name: "Alice" },
  { department: "Marketing", name: "Bob" },
  { department: "Engineering", name: "Charlie" },
  { department: "HR", name: "Diana" },
  { department: "Engineering", name: "Eve" },
];

describe("ResultsTable", () => {
  it("renders column headers correctly", () => {
    render(
      createElement(ResultsTable, {
        columns: ["name", "department"],
        executionTimeMs: 12,
        onDownload: vi.fn(),
        rowCount: 5,
        rows: resultRows,
      }),
    );

    expect(screen.getByRole("columnheader", { name: "name" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "department" }),
    ).toBeInTheDocument();
  });

  it("renders the correct number of rows", () => {
    render(
      createElement(ResultsTable, {
        columns: ["name", "department"],
        executionTimeMs: 12,
        onDownload: vi.fn(),
        rowCount: 5,
        rows: resultRows,
      }),
    );

    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it('shows "No results" when the rows array is empty', () => {
    render(
      createElement(ResultsTable, {
        columns: ["name"],
        executionTimeMs: 12,
        onDownload: vi.fn(),
        rowCount: 0,
        rows: [],
      }),
    );

    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it('shows row count text as "5 rows"', () => {
    render(
      createElement(ResultsTable, {
        columns: ["name", "department"],
        executionTimeMs: 12,
        onDownload: vi.fn(),
        rowCount: 5,
        rows: resultRows,
      }),
    );

    expect(screen.getByText(/5 rows/i)).toBeInTheDocument();
  });

  it('shows execution time text as "12ms"', () => {
    render(
      createElement(ResultsTable, {
        columns: ["name", "department"],
        executionTimeMs: 12,
        onDownload: vi.fn(),
        rowCount: 5,
        rows: resultRows,
      }),
    );

    expect(screen.getByText(/12\s*ms/i)).toBeInTheDocument();
  });

  it("shows a Download CSV button when results exist", () => {
    render(
      createElement(ResultsTable, {
        columns: ["name", "department"],
        executionTimeMs: 12,
        onDownload: vi.fn(),
        rowCount: 5,
        rows: resultRows,
      }),
    );

    expect(screen.getByRole("button", { name: /^download$/i })).toBeInTheDocument();
  });

  it("shows a Copy Results button when results exist", () => {
    render(
      createElement(ResultsTable, {
        columns: ["name", "department"],
        executionTimeMs: 12,
        onCopy: vi.fn(),
        onDownload: vi.fn(),
        rowCount: 5,
        rows: resultRows,
      }),
    );

    expect(screen.getByRole("button", { name: /copy results/i })).toBeInTheDocument();
  });

  it("hides the Download CSV button when no results exist", () => {
    render(
      createElement(ResultsTable, {
        columns: ["name"],
        executionTimeMs: 12,
        onDownload: vi.fn(),
        rowCount: 0,
        rows: [],
      }),
    );

    expect(
      screen.queryByRole("button", { name: /download csv/i }),
    ).not.toBeInTheDocument();
  });
});
