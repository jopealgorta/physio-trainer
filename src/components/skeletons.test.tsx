import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../messages/en.json";
import es from "../../messages/es.json";
import { HeaderSkeleton, ListSkeleton, LoadingPage } from "./skeletons";

const renderIn = (locale: "en" | "es", ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("LoadingPage", () => {
  it("announces loading", () => {
    renderIn(
      "en",
      <LoadingPage>
        <HeaderSkeleton back description actions={1} />
        <ListSkeleton rows={2} />
      </LoadingPage>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("hides the placeholder shapes from assistive tech", () => {
    const { container } = renderIn(
      "en",
      <LoadingPage>
        <ListSkeleton rows={3} />
      </LoadingPage>,
    );
    const shapes = container.querySelectorAll('[data-slot="skeleton"]');
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) expect(shape.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("speaks Spanish", () => {
    renderIn("es", <LoadingPage>{null}</LoadingPage>);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
  });
});
