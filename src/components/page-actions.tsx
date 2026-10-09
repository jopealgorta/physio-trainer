"use client";

import { EllipsisIcon, Loader2Icon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * A detail page's secondary actions: one "⋯" menu. On phones it stands in for the rows of labelled
 * buttons. Each control (Share, Export, History…) stays mounted where it is, owning its dialog,
 * and inside `PageActions` also puts itself in the menu (`usePageAction`). `PageHeader` hides the
 * controls' own row below `sm` (their dialogs are portalled, so they still open) and shows the
 * menu there instead. What a control says inline (an error, "Version restored.") it also hands to
 * `usePageNotice`, shown on phones by `PageNotices`. Rare or risky actions (Archive, Delete) have
 * no button of their own: `menuOnly` keeps them in the menu at every size, which then shows from
 * `sm` up too, listing only those.
 */
export type PageAction = {
  label: string;
  /** Position in the menu; a new tens digit starts a new group (a separator). */
  order: number;
  icon?: ReactNode;
  onSelect?: () => void;
  /** A link item instead of a button. */
  href?: string;
  /** With `href`: a download link (a plain `<a download>`, not a page navigation). */
  download?: boolean;
  /** A checkbox item (it keeps the menu open); `onSelect` toggles it. */
  checked?: boolean;
  disabled?: boolean;
  /** Still running (an export): the item is disabled and the menu's trigger shows it. */
  pending?: boolean;
  /** Opens a dialog or sheet: run once the menu has closed, so the two do not fight over focus. */
  opensDialog?: boolean;
  /** No button of its own: in the menu at every size, not only on phones. */
  menuOnly?: boolean;
  /** Destroys or hides something (Delete): shown in red. */
  destructive?: boolean;
};

type Entry = Omit<PageAction, "onSelect" | "icon"> & {
  id: string;
  run: () => void;
  icon: () => ReactNode;
};

export type PageNotice = { text: string; tone: "error" | "info" };

type Registry = {
  action: (id: string, entry: Entry) => () => void;
  notice: (id: string, notice: PageNotice) => () => void;
  /** The "⋯" button, where focus goes back when a dialog opened from it closes. */
  menuTrigger: RefObject<HTMLButtonElement | null>;
  /** Listeners for the menu opening (controls clear a stale message then). */
  menuOpened: RefObject<Set<() => void>>;
};

const RegistryContext = createContext<Registry | null>(null);
const EntriesContext = createContext<ReadonlyMap<string, Entry>>(new Map());
const NoticesContext = createContext<ReadonlyMap<string, PageNotice>>(new Map());

/** A keyed map in state, with an add that returns its own removal. */
function useRegistered<T>() {
  const [items, setItems] = useState<ReadonlyMap<string, T>>(() => new Map());
  const add = useCallback((id: string, item: T) => {
    setItems((previous) => new Map(previous).set(id, item));
    return () =>
      setItems((previous) => {
        // A newer registration of the same id replaced this one: leave it.
        if (previous.get(id) !== item) return previous;
        const next = new Map(previous);
        next.delete(id);
        return next;
      });
  }, []);
  return [items, add] as const;
}

export function PageActions({ children }: { children: ReactNode }) {
  const [entries, addEntry] = useRegistered<Entry>();
  const [notices, addNotice] = useRegistered<PageNotice>();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const menuOpened = useRef(new Set<() => void>());
  const registry = useMemo(
    () => ({ action: addEntry, notice: addNotice, menuTrigger, menuOpened }),
    [addEntry, addNotice],
  );
  return (
    <RegistryContext.Provider value={registry}>
      <EntriesContext.Provider value={entries}>
        <NoticesContext.Provider value={notices}>{children}</NoticesContext.Provider>
      </EntriesContext.Provider>
    </RegistryContext.Provider>
  );
}

/** Whether this is inside `PageActions` (the page has a "⋯" menu). */
export function useInPageActions(): boolean {
  return useContext(RegistryContext) !== null;
}

/** Whether an element is laid out (neither it nor an ancestor is `display: none`). */
function displayed(element: HTMLElement) {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") return false;
  }
  return element.isConnected;
}

/**
 * Puts a control's action in the page's "⋯" menu (`null` leaves it out); outside `PageActions` it
 * does nothing. `inMenu` says whether the page has a menu. Pass `onCloseAutoFocus` to the
 * control's dialog content: while the menu is showing (phones), closing the dialog returns focus
 * to the menu's button, since the control's own trigger is hidden there.
 */
export function usePageAction(
  id: string,
  action: PageAction | null,
): { inMenu: boolean; onCloseAutoFocus: (event: Event) => void } {
  const registry = useContext(RegistryContext);
  const register = registry?.action;
  // Callbacks and icons change identity every render; the menu reads the latest through this.
  const latest = useRef(action);
  useLayoutEffect(() => {
    latest.current = action;
  });

  const present = action !== null;
  const {
    label = "",
    order = 0,
    href,
    download,
    checked,
    disabled,
    pending,
    opensDialog,
    menuOnly,
    destructive,
  } = action ?? {};
  useEffect(() => {
    if (!register || !present) return;
    return register(id, {
      id,
      label,
      order,
      href,
      download,
      checked,
      disabled,
      pending,
      opensDialog,
      menuOnly,
      destructive,
      run: () => latest.current?.onSelect?.(),
      icon: () => latest.current?.icon,
    });
  }, [
    register,
    present,
    id,
    label,
    order,
    href,
    download,
    checked,
    disabled,
    pending,
    opensDialog,
    menuOnly,
    destructive,
  ]);

  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      const menu = registry?.menuTrigger.current;
      if (!menu || !displayed(menu)) return;
      event.preventDefault();
      menu.focus();
    },
    [registry],
  );

  return { inMenu: registry !== null, onCloseAutoFocus };
}

/** Calls `listener` whenever the page's "⋯" menu opens (e.g. to clear a stale error). */
export function useMenuOpened(listener: () => void) {
  const menuOpened = useContext(RegistryContext)?.menuOpened;
  const latest = useRef(listener);
  useLayoutEffect(() => {
    latest.current = listener;
  });
  useEffect(() => {
    if (!menuOpened) return;
    const call = () => latest.current();
    const listeners = menuOpened.current;
    listeners.add(call);
    return () => {
      listeners.delete(call);
    };
  }, [menuOpened]);
}

/** Repeats a control's inline message in `PageNotices` (phones), while it is not null. */
export function usePageNotice(id: string, notice: PageNotice | null) {
  const register = useContext(RegistryContext)?.notice;
  const text = notice?.text;
  const tone = notice?.tone;
  useEffect(() => {
    if (!register || text === undefined || tone === undefined) return;
    return register(id, { text, tone });
  }, [register, id, text, tone]);
}

/**
 * The controls' messages on phones, where their own rows are hidden. Always rendered, as a live
 * region that is out of the layout while empty; hidden from `sm` up, where the controls say it.
 */
export function PageNotices({ className }: { className?: string }) {
  const notices = useContext(NoticesContext);
  return (
    <div
      role="status"
      data-testid="page-notices"
      className={cn("grid gap-1 text-sm empty:sr-only sm:hidden", className)}
    >
      {[...notices].map(([id, notice]) => (
        <p
          key={id}
          className={notice.tone === "error" ? "text-destructive" : "text-muted-foreground"}
        >
          {notice.text}
        </p>
      ))}
    </div>
  );
}

/**
 * The "⋯" button and its menu: every action on phones; from `sm` up only the `menuOnly` ones, and
 * no button at all when there are none (the other items and separators are hidden there by CSS,
 * so nothing changes when the page hydrates).
 */
export function PageActionsMenu({ className }: { className?: string }) {
  const t = useTranslations("PageActions");
  const entries = useContext(EntriesContext);
  const registry = useContext(RegistryContext);
  const menuTrigger = registry?.menuTrigger;
  const sorted = useMemo(() => [...entries.values()].sort((a, b) => a.order - b.order), [entries]);
  const busy = sorted.some((entry) => entry.pending);
  const everySize = sorted.some((entry) => entry.menuOnly);
  // A dialog item's action waits for the menu to close (see `opensDialog`).
  const deferred = useRef<(() => void) | null>(null);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) for (const listener of registry?.menuOpened.current ?? []) listener();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          ref={menuTrigger}
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={t("more")}
          aria-busy={busy}
          className={cn(!everySize && "sm:hidden", className)}
        >
          {busy ? (
            <Loader2Icon aria-hidden className="animate-spin motion-reduce:animate-none" />
          ) : (
            <EllipsisIcon aria-hidden />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-56"
        onCloseAutoFocus={(event) => {
          const run = deferred.current;
          if (!run) return;
          deferred.current = null;
          // The dialog takes focus; returning it to the trigger first would close it again.
          event.preventDefault();
          run();
        }}
      >
        {sorted.map((entry, index) => {
          const previous = sorted[index - 1];
          // From `sm` up, the menu lists only the menu-only actions.
          const previousShown = sorted.slice(0, index).findLast((other) => other.menuOnly);
          const group = (other: Entry) => Math.floor(other.order / 10);
          const onPhones = previous !== undefined && group(previous) !== group(entry);
          const fromSm =
            entry.menuOnly === true &&
            previousShown !== undefined &&
            group(previousShown) !== group(entry);
          return (
            <MenuEntry
              key={entry.id}
              entry={entry}
              separator={
                onPhones && fromSm ? "always" : onPhones ? "phones" : fromSm ? "fromSm" : null
              }
              onDeferred={(run) => (deferred.current = run)}
            />
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuEntry({
  entry,
  separator,
  onDeferred,
}: {
  entry: Entry;
  /** Where a separator goes before the item: at every size, on phones only, or from `sm` up. */
  separator: "always" | "phones" | "fromSm" | null;
  onDeferred: (run: () => void) => void;
}) {
  const icon = entry.icon();
  const className = entry.menuOnly ? undefined : "sm:hidden";
  const variant = entry.destructive ? "destructive" : "default";
  const item =
    entry.checked !== undefined ? (
      <DropdownMenuCheckboxItem
        className={className}
        checked={entry.checked}
        disabled={entry.disabled}
        onCheckedChange={() => entry.run()}
        onSelect={(event) => event.preventDefault()}
      >
        {entry.label}
      </DropdownMenuCheckboxItem>
    ) : entry.href !== undefined && entry.download ? (
      <DropdownMenuItem asChild className={className} variant={variant}>
        <a href={entry.href} download>
          {icon}
          {entry.label}
        </a>
      </DropdownMenuItem>
    ) : entry.href !== undefined ? (
      <DropdownMenuItem asChild className={className} variant={variant}>
        <Link href={entry.href as Route}>
          {icon}
          {entry.label}
        </Link>
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem
        className={className}
        variant={variant}
        disabled={entry.disabled || entry.pending}
        onSelect={() => (entry.opensDialog ? onDeferred(entry.run) : entry.run())}
      >
        {icon}
        {entry.label}
      </DropdownMenuItem>
    );
  return (
    <>
      {separator ? (
        <DropdownMenuSeparator
          className={
            separator === "phones" ? "sm:hidden" : separator === "fromSm" ? "hidden sm:block" : ""
          }
        />
      ) : null}
      {item}
    </>
  );
}
