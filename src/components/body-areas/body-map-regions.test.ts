import { describe, expect, it } from "vitest";

import { BODY_AREAS, PAIRED_BODY_AREAS } from "@/lib/body-areas";

import {
  MAP_HEIGHT,
  MAP_REGIONS,
  MAP_WIDTH,
  mirrorPath,
  pathBounds,
  type MapRegion,
} from "./body-map-regions";

const centerX = (region: MapRegion) => {
  const { left, right } = pathBounds(region.shape.d);
  return (left + right) / 2;
};

const find = (id: string) => {
  const region = MAP_REGIONS.find((candidate) => candidate.id === id);
  if (!region) throw new Error(`missing region ${id}`);
  return region;
};

describe("pathBounds", () => {
  it("measures the absolute points of a path", () => {
    expect(pathBounds("M10 20 C30 5 40 50 12 60 L4 33 Z")).toEqual({
      left: 4,
      top: 5,
      right: 40,
      bottom: 60,
    });
  });
});

describe("mirrorPath", () => {
  it("flips every x across the canvas and keeps every y", () => {
    expect(mirrorPath("M10 20 C30 5 40 50 12 60 L4 33 Z")).toBe(
      `M${MAP_WIDTH - 10} 20 C${MAP_WIDTH - 30} 5 ${MAP_WIDTH - 40} 50 ${MAP_WIDTH - 12} 60 L${MAP_WIDTH - 4} 33 Z`,
    );
  });
});

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

  it("draws the two sides of a paired area as mirror images", () => {
    const left = pathBounds(find("front-shoulder-left").shape.d);
    const right = pathBounds(find("front-shoulder-right").shape.d);
    expect(left.left).toBeCloseTo(MAP_WIDTH - right.right);
    expect(left.top).toBe(right.top);
  });

  it("keeps every shape inside the canvas", () => {
    for (const { shape } of MAP_REGIONS) {
      const { left, top, right, bottom } = pathBounds(shape.d);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(MAP_WIDTH);
      expect(bottom).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });
});
