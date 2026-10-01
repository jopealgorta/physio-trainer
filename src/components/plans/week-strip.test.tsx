import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { WeekStrip } from "./week-strip";

const setup = (locale: "en" | "es", sessionsPerDay: number[]) =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? enMessages : esMessages}
      timeZone="UTC"
    >
      <WeekStrip sessionsPerDay={sessionsPerDay} />
    </NextIntlClientProvider>,
  );

describe("WeekStrip", () => {
  it("describes every day for assistive technology, Monday first", () => {
    setup("en", [2, 0, 1, 0, 0, 0, 0]);
    const label = screen.getByRole("img").getAttribute("aria-label");
    expect(label).toBe(
      "Routines per day: Monday: 2 routines, Tuesday: rest, Wednesday: 1 routine, Thursday: rest, Friday: rest, Saturday: rest, Sunday: rest",
    );
  });

  it("fills the days that have routines and shows one initial per day", () => {
    const { container } = setup("en", [1, 0, 0, 0, 0, 1, 0]);
    const cells = Array.from(container.querySelectorAll("span[title]"));
    expect(cells).toHaveLength(7);
    expect(cells.map((cell) => cell.textContent)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    expect(cells.map((cell) => cell.className.includes("bg-primary"))).toEqual([
      true,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it("uses the locale's weekday names", () => {
    setup("es", [0, 3, 0, 0, 0, 0, 0]);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("martes: 3 rutinas");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("lunes: descanso");
  });

  it("treats missing days as rest", () => {
    setup("en", []);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Monday: rest");
  });
});
