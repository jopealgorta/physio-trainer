import { closestCorners, pointerWithin, type CollisionDetection } from "@dnd-kit/core";

/**
 * The droppable under the pointer wins; with no pointer over one (a keyboard drag, a gap
 * between rows) the nearest corners decide. `closestCorners` alone measures from the dragged
 * card's corners, and in short, wide day rows the card hangs into the next row, so it would
 * drop one day too low.
 */
export const pointerFirst: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCorners(args);
};
