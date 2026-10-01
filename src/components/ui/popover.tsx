"use client";

import * as React from "react";
import { cn } from "cn";
import { Dialog as SheetPrimitive, Popover as PopoverPrimitive, Slot } from "radix-ui";

import { SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/lib/use-media-query";

/**
 * A popover on screens from `sm` up and a bottom sheet on phones: a floating card anchored to a
 * small trigger is hard to read and reach there. Callers write one `Popover`; the switch is here.
 * Size the content for desktop under `sm:` (`sm:w-96`) so the sheet keeps its full width.
 */
const PopoverContext = React.createContext({ sheet: false, titleId: "" });

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const sheet = useIsMobile();
  const titleId = React.useId();
  return (
    <PopoverContext.Provider value={{ sheet, titleId }}>
      {sheet ? (
        <SheetPrimitive.Root
          data-slot="popover"
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
        >
          {children}
        </SheetPrimitive.Root>
      ) : (
        <PopoverPrimitive.Root
          data-slot="popover"
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          {...props}
        >
          {children}
        </PopoverPrimitive.Root>
      )}
    </PopoverContext.Provider>
  );
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const { sheet } = React.useContext(PopoverContext);
  const Trigger = sheet ? SheetPrimitive.Trigger : PopoverPrimitive.Trigger;
  return <Trigger data-slot="popover-trigger" {...props} />;
}

/** Positions a popover against something other than its trigger. A sheet has no anchor. */
function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  const { sheet } = React.useContext(PopoverContext);
  if (sheet) return props.asChild ? <Slot.Root {...props} /> : <div {...props} />;
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

/** Props that only mean something to a floating popover; a sheet is not positioned. */
const POSITIONING_PROPS = [
  "side",
  "sideOffset",
  "align",
  "alignOffset",
  "arrowPadding",
  "avoidCollisions",
  "collisionBoundary",
  "collisionPadding",
  "sticky",
  "hideWhenDetached",
  "updatePositionStrategy",
] as const;

function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  collisionPadding = 16,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const { sheet, titleId } = React.useContext(PopoverContext);

  if (sheet) {
    const sheetProps: Record<string, unknown> = { ...props };
    for (const key of POSITIONING_PROPS) delete sheetProps[key];
    return (
      <SheetContent
        side="bottom"
        showCloseButton={false}
        // The content describes itself; Radix would otherwise warn about a missing description.
        aria-describedby={undefined}
        data-slot="popover-content"
        data-presentation="sheet"
        className={cn(
          "max-h-[85dvh] gap-3 overflow-y-auto overscroll-contain rounded-t-xl p-4 pt-3",
          className,
          "pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
        {...sheetProps}
      >
        <div
          aria-hidden
          className="bg-muted-foreground/30 mx-auto h-1 w-10 shrink-0 rounded-full"
        />
        {children}
      </SheetContent>
    );
  }

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        data-presentation="popover"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        aria-labelledby={titleId}
        className={cn(
          "bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-50 flex w-72 max-w-[calc(100vw-2rem)] origin-(--radix-popover-content-transform-origin) flex-col gap-3 rounded-lg p-3 text-xs/relaxed shadow-md ring-1 duration-100 outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

/**
 * The popover's accessible name. Every popover needs one: on phones it is a dialog, and Radix
 * requires a title there. Use `className="sr-only"` when the design shows no heading.
 */
function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  const { sheet, titleId } = React.useContext(PopoverContext);
  if (sheet) return <SheetTitle className={className} {...props} />;
  return (
    <h2
      id={titleId}
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTitle, PopoverTrigger };
