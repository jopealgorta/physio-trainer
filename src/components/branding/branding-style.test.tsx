import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { brandTokens } from "@/lib/color";

import { BrandingStyle } from "./branding-style";

describe("BrandingStyle", () => {
  it("scopes light and dark tokens to the brand root", () => {
    const tokens = brandTokens("#0f766e");
    const { container } = render(<BrandingStyle tokens={tokens} scope="patient" />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain(
      `[data-brand="patient"]{--primary:${tokens.light.primary};--primary-foreground:${tokens.light.primaryForeground}}`,
    );
    expect(css).toContain(
      `.dark [data-brand="patient"]{--primary:${tokens.dark.primary};--primary-foreground:${tokens.dark.primaryForeground}}`,
    );
  });

  it("renders nothing without tokens (app defaults)", () => {
    const { container } = render(<BrandingStyle tokens={null} scope="patient" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("refuses values that are not plain hex colours", () => {
    const tokens = brandTokens("#0f766e");
    const evil = { ...tokens, light: { ...tokens.light, primary: "red}body{display:none" } };
    const { container } = render(<BrandingStyle tokens={evil} scope="patient" />);
    expect(container).toBeEmptyDOMElement();
    const { container: badScope } = render(<BrandingStyle tokens={tokens} scope={'x"]{}'} />);
    expect(badScope).toBeEmptyDOMElement();
  });
});
