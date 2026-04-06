// @vitest-environment jsdom

import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorDisplay } from "@/components/ErrorDisplay";

describe("ErrorDisplay", () => {
  it("does not render when the error is null", () => {
    const { container } = render(createElement(ErrorDisplay, { message: null }));

    expect(container).toBeEmptyDOMElement();
  });

  it("does not render when the error is undefined", () => {
    const { container } = render(
      createElement(ErrorDisplay, { message: undefined }),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the error message when present", () => {
    render(createElement(ErrorDisplay, { message: "Syntax error near FROM" }));

    expect(screen.getByText("Syntax error near FROM")).toBeInTheDocument();
  });

  it("uses an error-specific visual treatment", () => {
    const { container } = render(createElement(ErrorDisplay, { message: "Boom" }));

    expect(container.querySelector("section")).toHaveClass("border-red-300");
  });
});
