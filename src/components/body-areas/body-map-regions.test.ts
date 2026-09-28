import { describe, expect, it } from "vitest";

import { BODY_AREAS, PAIRED_BODY_AREAS } from "@/lib/body-areas";

import { MAP_HEIGHT, MAP_REGIONS, MAP_WIDTH, type MapRegion } from "./body-map-regions";

const centerX = (region: MapRegion) =>
  region.shape.kind === "rect" ? region.shape.x + region.shape.width / 2 : region.shape.cx;

const find = (id: string) => {
  const region = MAP_REGIONS.find((candidate) => candidate.id === id);
  if (!region) throw new Error(`missing region ${id}`);
  return region;
};

describe("MAP_REGIONS", () => {
  it("has unique ids", () => {
    const ids = MAP_REGIONS.map((region) => region.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws every area except full_body", () => {
    const drawn = new Set(MAP_REGIONS.map((region) => region.area));
    expect([...drawn].sort()).toEqual(BODY_AREAS.filter((area) => area !== "full_body").sort());
  });

  it("draws paired areas once per side and midline areas without a side", () => {
    for (const region of MAP_REGIONS) {
      const paired = (PAIRED_BODY_AREAS as readonly string[]).includes(region.area);
      expect(region.side === null).toBe(!paired);
    }
    for (const area of PAIRED_BODY_AREAS) {
      for (const view of ["front", "back"] as const) {
        const sides = MAP_REGIONS.filter((r) => r.area === area && r.view === view).map(
          (r) => r.side,
        );
        if (sides.length > 0) expect(sides.sort()).toEqual(["left", "right"]);
      }
    }
  });

  // Front view faces the viewer: the patient's left is on the viewer's right.
  it("mirrors the front view and not the back view", () => {
    expect(centerX(find("front-knee-left"))).toBeGreaterThan(MAP_WIDTH / 2);
    expect(centerX(find("front-knee-right"))).toBeLessThan(MAP_WIDTH / 2);
    expect(centerX(find("back-knee-left"))).toBeLessThan(MAP_WIDTH / 2);
    expect(centerX(find("back-knee-right"))).toBeGreaterThan(MAP_WIDTH / 2);
  });

  it("keeps every shape inside the canvas", () => {
    for (const { shape } of MAP_REGIONS) {
      const [left, top, right, bottom] =
        shape.kind === "rect"
          ? [shape.x, shape.y, shape.x + shape.width, shape.y + shape.height]
          : [shape.cx - shape.rx, shape.cy - shape.ry, shape.cx + shape.rx, shape.cy + shape.ry];
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(MAP_WIDTH);
      expect(bottom).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });
});
