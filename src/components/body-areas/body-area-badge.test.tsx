import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

import { BodyAreaBadge } from "./body-area-badge";

describe("BodyAreaBadge", () => {
  it("shows the area and, when set, the side", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <BodyAreaBadge area="knee" side="left" />
        <BodyAreaBadge area="neck" side={null} />
        <BodyAreaBadge area="full_body" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Knee · Left")).toBeInTheDocument();
    expect(screen.getByText("Neck")).toBeInTheDocument();
    expect(screen.getByText("Full body")).toBeInTheDocument();
  });

  it("is localised", () => {
    render(
      <NextIntlClientProvider locale="es" messages={es} timeZone="UTC">
        <BodyAreaBadge area="knee" side="both" />
        <BodyAreaBadge area="hip_groin" side="left" />
        <BodyAreaBadge area="elbow" side="right" />
      </NextIntlClientProvider>,
    );
    // The side reads as "lado …" so it agrees whatever the area's grammatical gender.
    expect(screen.getByText("Rodilla · ambos lados")).toBeInTheDocument();
    expect(screen.getByText("Cadera e ingle · lado izquierdo")).toBeInTheDocument();
    expect(screen.getByText("Codo · lado derecho")).toBeInTheDocument();
  });
});
