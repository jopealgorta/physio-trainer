import type { BodyArea, RegionSide } from "@/lib/body-areas";

export const BODY_VIEWS = ["front", "back"] as const;
export type BodyView = (typeof BODY_VIEWS)[number];

export const MAP_WIDTH = 200;
export const MAP_HEIGHT = 440;

export type RegionShape =
  | { kind: "rect"; x: number; y: number; width: number; height: number; radius: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number };

export type MapRegion = {
  id: string;
  view: BodyView;
  area: BodyArea;
  side: RegionSide | null;
  shape: RegionShape;
};

const rect = (x: number, y: number, width: number, height: number, radius = 8): RegionShape => ({
  kind: "rect",
  x,
  y,
  width,
  height,
  radius,
});

function mirror(shape: RegionShape): RegionShape {
  return shape.kind === "rect"
    ? { ...shape, x: MAP_WIDTH - shape.x - shape.width }
    : { ...shape, cx: MAP_WIDTH - shape.cx };
}

function midline(view: BodyView, area: BodyArea, shape: RegionShape): MapRegion[] {
  return [{ id: `${view}-${area}`, view, area, side: null, shape }];
}

/** `shape` is drawn on the viewer's left: the patient's right on the front view, left on the back. */
function paired(view: BodyView, area: BodyArea, shape: RegionShape): MapRegion[] {
  const near: RegionSide = view === "front" ? "right" : "left";
  const far: RegionSide = near === "left" ? "right" : "left";
  return [
    { id: `${view}-${area}-${near}`, view, area, side: near, shape },
    { id: `${view}-${area}-${far}`, view, area, side: far, shape: mirror(shape) },
  ];
}

// Shared silhouette pieces (viewer's left for paired shapes).
const HEAD: RegionShape = { kind: "ellipse", cx: 100, cy: 34, rx: 20, ry: 24 };
const NECK = rect(91, 60, 18, 16, 5);
const SHOULDER = rect(46, 80, 22, 26, 11);
const UPPER_ARM = rect(46, 108, 20, 62, 9);
const ELBOW = rect(45, 172, 20, 18, 8);
const FOREARM_WRIST_HAND = rect(42, 192, 20, 76, 9);
const THIGH = rect(73, 240, 25, 70, 10);
const KNEE = rect(75, 312, 22, 24, 10);
const LOWER_LEG = rect(76, 338, 20, 62, 8);
const ANKLE_FOOT = rect(72, 402, 26, 26, 8);

const limbs = (view: BodyView): MapRegion[] => [
  ...paired(view, "shoulder", SHOULDER),
  ...paired(view, "upper_arm", UPPER_ARM),
  ...paired(view, "elbow", ELBOW),
  ...paired(view, "forearm_wrist_hand", FOREARM_WRIST_HAND),
  ...paired(view, "thigh", THIGH),
  ...paired(view, "knee", KNEE),
  ...paired(view, "lower_leg", LOWER_LEG),
  ...paired(view, "ankle_foot", ANKLE_FOOT),
];

export const MAP_REGIONS: readonly MapRegion[] = [
  // Front
  ...midline("front", "head_jaw", HEAD),
  ...midline("front", "neck", NECK),
  ...midline("front", "chest", rect(70, 78, 60, 60, 10)),
  ...midline("front", "abdomen_core", rect(72, 140, 56, 56, 8)),
  ...paired("front", "hip_groin", rect(72, 198, 27, 40, 8)),
  ...limbs("front"),
  // Back
  ...midline("back", "head_jaw", HEAD),
  ...midline("back", "neck", NECK),
  ...midline("back", "upper_back", rect(70, 78, 60, 68, 10)),
  ...midline("back", "lower_back", rect(72, 148, 56, 48, 8)),
  ...paired("back", "glute", rect(72, 198, 27, 40, 10)),
  ...limbs("back"),
];
