import type { BodyArea, RegionSide } from "@/lib/body-areas";

export const BODY_VIEWS = ["front", "back"] as const;
export type BodyView = (typeof BODY_VIEWS)[number];

export const MAP_WIDTH = 200;
export const MAP_HEIGHT = 440;

/**
 * A region's outline as an SVG path. Paths use only absolute commands whose arguments are x/y
 * pairs (M, L, C, Z), so they can be measured and mirrored without an SVG parser.
 */
export type RegionShape = { d: string };

export type MapRegion = {
  id: string;
  view: BodyView;
  area: BodyArea;
  side: RegionSide | null;
  shape: RegionShape;
};

/** Rewrites every x/y pair in `d`; command letters and Z pass through. */
function mapPoints(d: string, map: (x: number, y: number) => [number, number]): string {
  return d.replace(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g, (_, x: string, y: string) =>
    map(Number(x), Number(y)).join(" "),
  );
}

/** The bounding box of a path's points (control points included, so it is a safe outer bound). */
export function pathBounds(d: string) {
  const xs: number[] = [];
  const ys: number[] = [];
  mapPoints(d, (x, y) => {
    xs.push(x);
    ys.push(y);
    return [x, y];
  });
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/** Flips a path across the vertical midline of the canvas. */
export function mirrorPath(d: string): string {
  return mapPoints(d, (x, y) => [MAP_WIDTH - x, y]);
}

function midline(view: BodyView, area: BodyArea, d: string): MapRegion[] {
  return [{ id: `${view}-${area}`, view, area, side: null, shape: { d } }];
}

/** `d` is drawn on the viewer's left: the patient's right on the front view, left on the back. */
function paired(view: BodyView, area: BodyArea, d: string): MapRegion[] {
  const near: RegionSide = view === "front" ? "right" : "left";
  const far: RegionSide = near === "left" ? "right" : "left";
  return [
    { id: `${view}-${area}-${near}`, view, area, side: near, shape: { d } },
    { id: `${view}-${area}-${far}`, view, area, side: far, shape: { d: mirrorPath(d) } },
  ];
}

// The silhouette: neighbouring regions share their edges, and the map strokes every region in
// the background colour, so the seams read as thin gaps in one continuous figure.
// Paired pieces are drawn on the viewer's left (x < 100).
const HEAD =
  "M100 6 C113 6 121 16 121 30 C121 42 116 51 109 55 C106 57 103 58 100 58 C97 58 94 57 91 55 C84 51 79 42 79 30 C79 16 87 6 100 6 Z";
const NECK = "M90 54 C94 58 106 58 110 54 L112 70 C108 74 92 74 88 70 Z";
const SHOULDER = "M72 79 C62 78 51 83 47 94 C45 101 45 109 47 116 L64 113 C66 103 69 91 72 79 Z";
const UPPER_ARM = "M47 116 L64 113 C66 130 64 150 60 171 L43 174 C41 156 42 134 47 116 Z";
const ELBOW = "M43 174 L60 171 C59 179 58 187 56 195 L40 197 C40 189 41 181 43 174 Z";
const FOREARM_WRIST_HAND =
  "M40 197 L56 195 C55 213 52 235 48 253 C50 261 49 273 46 283 C43 289 35 289 32 283 C31 273 32 261 35 253 C35 233 37 213 40 197 Z";
const THIGH = "M70 238 C78 244 90 246 99 242 C97 266 95 292 93 318 L75 318 C71 292 68 264 70 238 Z";
const KNEE = "M75 318 L93 318 C94 327 93 337 92 346 L76 346 C75 337 75 327 75 318 Z";
const LOWER_LEG = "M76 346 L92 346 C94 364 93 386 90 406 L80 406 C76 386 74 364 76 346 Z";
const ANKLE_FOOT =
  "M80 406 L90 406 C91 414 92 420 94 425 C96 431 92 434 86 434 L75 434 C70 434 70 429 74 425 C78 420 80 414 80 406 Z";

// Torso: the chest (front) and upper back (back) take in the trapezius slope from the neck to
// the top of each shoulder; the abdomen and lower back narrow slightly at the waist.
const CHEST =
  "M88 70 C92 74 108 74 112 70 L128 79 C131 94 132 112 131 126 C130 132 128 136 127 140 L73 140 C72 136 70 132 69 126 C68 112 69 94 72 79 Z";
const ABDOMEN_CORE = "M73 140 L127 140 C126 160 124 178 131 200 L69 200 C76 178 74 160 73 140 Z";
const HIP_GROIN =
  "M69 200 L100 200 L100 236 C99 239 99 241 99 242 C90 246 78 244 70 238 C67 226 67 212 69 200 Z";
const UPPER_BACK =
  "M88 70 C92 74 108 74 112 70 L128 79 C131 96 132 116 131 132 C130 138 128 143 127 148 L73 148 C72 143 70 138 69 132 C68 116 69 96 72 79 Z";
const LOWER_BACK = "M73 148 L127 148 C126 166 124 182 131 200 L69 200 C76 182 74 166 73 148 Z";
const GLUTE =
  "M69 200 L100 200 L100 238 C99 240 99 241 99 242 C90 247 78 245 70 238 C66 226 66 212 69 200 Z";

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
  ...midline("front", "chest", CHEST),
  ...midline("front", "abdomen_core", ABDOMEN_CORE),
  ...paired("front", "hip_groin", HIP_GROIN),
  ...limbs("front"),
  // Back
  ...midline("back", "head_jaw", HEAD),
  ...midline("back", "neck", NECK),
  ...midline("back", "upper_back", UPPER_BACK),
  ...midline("back", "lower_back", LOWER_BACK),
  ...paired("back", "glute", GLUTE),
  ...limbs("back"),
];
