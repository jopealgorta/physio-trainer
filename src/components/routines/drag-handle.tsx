import { GripVerticalIcon } from "lucide-react";

import type { SortableHandleProps } from "@/components/sortable/sortable-list";

/** The grip button that starts a drag or keyboard reorder (props come from `SortableList`). */
export function DragHandle({ handle }: { handle: SortableHandleProps }) {
  return (
    <button
      type="button"
      {...handle}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 shrink-0 cursor-grab touch-none rounded-md p-1 outline-none focus-visible:ring-[3px]"
    >
      <GripVerticalIcon aria-hidden className="size-4" />
    </button>
  );
}
