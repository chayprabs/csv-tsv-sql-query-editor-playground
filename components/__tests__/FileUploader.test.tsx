// @vitest-environment jsdom

import { createElement, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  FileUploader,
  type FilePreview,
} from "@/components/FileUploader";

function createSyntheticFileList(files: File[]): FileList {
  return {
    ...files,
    length: files.length,
    item: (index: number) => files[index] ?? null,
    *[Symbol.iterator]() {
      for (const file of files) {
        yield file;
      }
    },
  } as unknown as FileList;
}

function buildPreview(file: File, index: number): FilePreview {
  const tableName =
    file.name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]+/gi, "_").toLowerCase() ||
    `table_${index + 1}`;

  return {
    delimiter: "auto",
    effectiveDelimiter: ",",
    effectiveHasHeaders: true,
    headerMode: "auto",
    name: file.name,
    size: file.size,
    suggestedDelimiter: ",",
    suggestedHasHeaders: true,
    tableName,
  };
}

function FileUploaderHarness() {
  const [files, setFiles] = useState<FilePreview[]>([]);

  return createElement(FileUploader, {
    files,
    headerNotice: null,
    isLoading: false,
    onClear: () => setFiles([]),
    onDelimiterChange: (tableName, delimiter) =>
      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          file.tableName === tableName ? { ...file, delimiter } : file,
        ),
      ),
    onFilesSelected: (fileList) =>
      setFiles(
        Array.from(fileList ?? []).map((file, index) => buildPreview(file, index)),
      ),
    onHeaderModeChange: (tableName, headerMode) =>
      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          file.tableName === tableName ? { ...file, headerMode } : file,
        ),
      ),
  });
}

describe("FileUploader", () => {
  it("calls onFilesSelected when CSV files are dropped on the dropzone", () => {
    const onFilesSelected = vi.fn();

    render(
      createElement(FileUploader, {
        files: [],
        headerNotice: null,
        isLoading: false,
        onClear: vi.fn(),
        onDelimiterChange: vi.fn(),
        onFilesSelected,
        onHeaderModeChange: vi.fn(),
      }),
    );

    const dropTarget = screen.getByText(/drag and drop files here/i).closest("label");

    expect(dropTarget).toBeTruthy();

    const csvFile = new File(["h\n1"], "drop.csv", { type: "text/csv" });

    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        files: createSyntheticFileList([csvFile]),
      } as unknown as DataTransfer,
    });

    expect(onFilesSelected).toHaveBeenCalledTimes(1);

    const list = onFilesSelected.mock.calls[0][0] as FileList | null;

    expect(list?.length).toBe(1);
    expect(list?.item(0)?.name).toBe("drop.csv");
  });

  it("invokes onLoadSamples when the sample button is clicked", () => {
    const onLoadSamples = vi.fn();

    render(
      createElement(FileUploader, {
        files: [],
        headerNotice: null,
        isLoading: false,
        onClear: vi.fn(),
        onDelimiterChange: vi.fn(),
        onFilesSelected: vi.fn(),
        onHeaderModeChange: vi.fn(),
        onLoadSamples,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /load sample files/i }));

    expect(onLoadSamples).toHaveBeenCalledTimes(1);
  });

  it("renders a file input", () => {
    render(
      createElement(FileUploader, {
        files: [],
        headerNotice: null,
        isLoading: false,
        onClear: vi.fn(),
        onDelimiterChange: vi.fn(),
        onFilesSelected: vi.fn(),
        onHeaderModeChange: vi.fn(),
      }),
    );

    expect(screen.getByLabelText(/choose files/i)).toBeInTheDocument();
  });

  it("accepts multiple files", () => {
    render(
      createElement(FileUploader, {
        files: [],
        headerNotice: null,
        isLoading: false,
        onClear: vi.fn(),
        onDelimiterChange: vi.fn(),
        onFilesSelected: vi.fn(),
        onHeaderModeChange: vi.fn(),
      }),
    );

    expect(screen.getByLabelText(/choose files/i)).toHaveAttribute("multiple");
  });

  it("shows uploaded filenames after selection", () => {
    render(createElement(FileUploaderHarness));

    fireEvent.change(screen.getByLabelText(/choose files/i), {
      target: {
        files: [
          new File(["a"], "basic.csv", { type: "text/csv" }),
          new File(["b"], "departments.csv", { type: "text/csv" }),
        ],
      },
    });

    expect(screen.getByText("basic.csv")).toBeInTheDocument();
    expect(screen.getByText("departments.csv")).toBeInTheDocument();
  });

  it("shows inferred table names alongside filenames", () => {
    render(createElement(FileUploaderHarness));

    fireEvent.change(screen.getByLabelText(/choose files/i), {
      target: {
        files: [new File(["a"], "sales data.csv", { type: "text/csv" })],
      },
    });

    expect(screen.getByText(/table =/i)).toBeInTheDocument();
    expect(screen.getByText("sales_data")).toBeInTheDocument();
  });

  it("shows schema preview chips when they are provided", () => {
    render(
      createElement(FileUploader, {
        files: [
          {
            delimiter: ",",
            effectiveDelimiter: ",",
            effectiveHasHeaders: true,
            headerMode: "present",
            name: "basic.csv",
            schema: [
              { name: "id", type: "INTEGER" },
              { name: "name", type: "TEXT" },
            ],
            size: 100,
            suggestedDelimiter: ",",
            suggestedHasHeaders: true,
            tableName: "basic",
          },
        ],
        headerNotice: null,
        isLoading: false,
        onClear: vi.fn(),
        onDelimiterChange: vi.fn(),
        onFilesSelected: vi.fn(),
        onHeaderModeChange: vi.fn(),
      }),
    );

    expect(screen.getByText("Schema Preview")).toBeInTheDocument();
    expect(screen.getByText("id: INTEGER")).toBeInTheDocument();
    expect(screen.getByText("name: TEXT")).toBeInTheDocument();
  });

  it("updates per-file delimiter and header mode controls", () => {
    render(createElement(FileUploaderHarness));

    fireEvent.change(screen.getByLabelText(/choose files/i), {
      target: {
        files: [new File(["a"], "basic.csv", { type: "text/csv" })],
      },
    });

    fireEvent.change(screen.getByLabelText("Delimiter for basic.csv"), {
      target: { value: "\t" },
    });
    fireEvent.change(screen.getByLabelText("Header mode for basic.csv"), {
      target: { value: "absent" },
    });

    expect(screen.getByLabelText("Delimiter for basic.csv")).toHaveValue("\t");
    expect(screen.getByLabelText("Header mode for basic.csv")).toHaveValue("absent");
  });

  it("clears the rendered file list on reset", () => {
    render(createElement(FileUploaderHarness));

    fireEvent.change(screen.getByLabelText(/choose files/i), {
      target: {
        files: [new File(["a"], "basic.csv", { type: "text/csv" })],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /clear files/i }));

    expect(screen.queryByText("basic.csv")).not.toBeInTheDocument();
  });
});
