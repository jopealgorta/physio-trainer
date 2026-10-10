import type { CollisionDetection } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";

import { pointerFirst } from "./collision";

const rect = (top: number, bottom: number, left = 200, right = 700) => ({
  top,
  bottom,
  left,
  right,
  width: right - left,
  height: bottom - top,
});

/** Three stacked day zones (A, B, C) as the board lays them out. */
const zones = [
  { id: "day-1", rect: rect(0, 70) },
  { id: "day-2", rect: rect(80, 150) },
  { id: "day-3", rect: rect(160, 230) },
];

const args = (
  pointer: { x: number; y: number } | null,
  collisionRect: ReturnType<typeof rect>,
): Parameters<CollisionDetection>[0] =>
  ({
    active: { id: "card" },
    collisionRect,
    pointerCoordinates: pointer,
    droppableContainers: zones.map(({ id }) => ({ id, disabled: false })),
    droppableRects: new Map(zones.map(({ id, rect: r }) => [id, r])),
  }) as unknown as Parameters<CollisionDetection>[0];

describe("pointerFirst", () => {
  it("drops on the zone under the pointer even when the card body hangs over the next one", () => {
    // The pointer is low in day-2; the dragged card (grabbed by its top-left handle) extends
    // into day-3, whose corners are nearer to the card's corners than day-2's are.
    const result = pointerFirst(args({ x: 450, y: 140 }, rect(120, 208, 335, 565)));
    expect(result[0]?.id).toBe("day-2");
  });

  it("falls back to the nearest corners when there is no pointer (keyboard drag)", () => {
    const result = pointerFirst(args(null, rect(165, 225, 210, 690)));
    expect(result[0]?.id).toBe("day-3");
  });

  it("falls back to the nearest corners when the pointer is between zones", () => {
    const result = pointerFirst(args({ x: 450, y: 75 }, rect(10, 60, 210, 690)));
    expect(result[0]?.id).toBe("day-1");
  });
});
