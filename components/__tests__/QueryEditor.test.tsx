// @vitest-environment jsdom

import type { ComponentProps, FormEvent } from "react";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QueryEditor } from "@/components/QueryEditor";

function renderQueryEditor(
  overrides: Partial<ComponentProps<typeof QueryEditor>> = {},
) {
  const props: ComponentProps<typeof QueryEditor> = {
    hasFiles: true,
    isLoading: false,
    onInputEncodingChange: vi.fn(),
    onQueryChange: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    placeholder: "SELECT * FROM basic LIMIT 10",
    query: "SELECT * FROM basic",
    ...overrides,
  };

  return {
    props,
    ...render(createElement(QueryEditor, props)),
  };
}

describe("QueryEditor", () => {
  it("renders a textarea", () => {
    renderQueryEditor();

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("updates the query value on change", () => {
    const onQueryChange = vi.fn();

    renderQueryEditor({
      onQueryChange,
      query: "",
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "SELECT name FROM basic" },
    });

    expect(onQueryChange).toHaveBeenCalledWith("SELECT name FROM basic");
  });

  it("shows the placeholder text", () => {
    renderQueryEditor({
      query: "",
    });

    expect(screen.getByPlaceholderText("SELECT * FROM basic LIMIT 10")).toBeInTheDocument();
  });

  it("shows the per-file parsing note", () => {
    renderQueryEditor();

    expect(screen.getByText(/delimiter and header handling now live on each uploaded file card/i)).toBeInTheDocument();
  });

  it("disables the submit button when the query is empty", () => {
    renderQueryEditor({
      query: "",
    });

    expect(screen.getByRole("button", { name: /run query/i })).toBeDisabled();
  });

  it("disables the submit button when no files are uploaded", () => {
    renderQueryEditor({
      hasFiles: false,
    });

    expect(screen.getByRole("button", { name: /run query/i })).toBeDisabled();
  });

  it("enables the submit button when both files and a query are present", () => {
    renderQueryEditor({
      hasFiles: true,
      query: "SELECT * FROM basic",
    });

    expect(screen.getByRole("button", { name: /run query/i })).toBeEnabled();
  });

  it("submits on Ctrl+Enter", () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    renderQueryEditor({
      onSubmit,
    });

    fireEvent.keyDown(screen.getByRole("textbox"), {
      ctrlKey: true,
      key: "Enter",
    });

    expect(onSubmit).toHaveBeenCalled();
  });
});
