import { describe, expect, it } from "vitest";
import {
  distanceDisplay,
  durationToInput,
  metersToKmInput,
  parseDurationInput,
  parseKm,
} from "./distance";

describe("parseKm", () => {
  it.each([
    ["5", 5000],
    ["2,5", 2500],
    ["2.5", 2500],
    ["0.8", 800],
    [" 10 ", 10000],
    ["0,125", 125],
  ])("%s km → %s m", (input, meters) => expect(parseKm(input)).toBe(meters));
  it("blank is null", () => expect(parseKm("  ")).toBeNull());
  it.each(["abc", "-1", "0", "1.2.3"])("%s is invalid", (input) =>
    expect(parseKm(input)).toBeUndefined(),
  );
});
describe("metersToKmInput", () => {
  it.each([
    [5000, "5"],
    [2500, "2.5"],
    [800, "0.8"],
    [125, "0.125"],
    [null, ""],
  ])("%s → %s", (m, s) => expect(metersToKmInput(m)).toBe(s));
});
describe("distanceDisplay", () => {
  it("metres under 1 km", () => expect(distanceDisplay(800)).toEqual({ unit: "m", value: 800 }));
  it("km from 1 km", () => expect(distanceDisplay(2500)).toEqual({ unit: "km", value: 2.5 }));
});
describe("duration input", () => {
  it.each([
    ["30", 1800],
    ["1:30", 90],
    ["45:00", 2700],
    ["0:45", 45],
  ])("%s → %s s", (input, s) => expect(parseDurationInput(input)).toBe(s));
  it("blank is null", () => expect(parseDurationInput("")).toBeNull());
  it.each(["x", "1:75", "-3"])("%s invalid", (input) =>
    expect(parseDurationInput(input)).toBeUndefined(),
  );
  it.each([
    [1800, "30"],
    [90, "1:30"],
    [45, "0:45"],
    [null, ""],
  ])("%s → %s", (s, out) => expect(durationToInput(s)).toBe(out));
});
