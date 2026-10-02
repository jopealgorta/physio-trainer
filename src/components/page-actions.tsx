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
 * A page's secondary actions on phones (routine and plan pages): one "⋯" menu instead of rows of
 * labelled buttons. Each control (Share, Export, History…) stays mounted where it is, owning its
 * dialog, and inside `PageActions` also puts itself in the menu (`usePageAction`). The page hides
 * the controls' own rows below `sm` (`hidden sm:flex`; their dialogs are portalled, so they still
 * open) and shows the menu there instead. What a control says inline (an error, "Version
 * restored.") it also hands to `usePageNotice`, shown on phones by `PageNotices`.
 */
export type PageAction = {
  label: string;
  /** Position in the menu; a new tens digit starts a new group (a separator). */
  order: number;
  icon?: ReactNode;
  onSelect?: () => void;
  /** A link item instead of a button. */
  href?: string;
  /** A checkbox item (it keeps the menu open); `onSelect` toggles it. */
  checked?: boolean;
  disabled?: boolean;
  /** Still running (an export): the item is disabled and the menu's trigger shows it. */
  pending?: boolean;
  /** Opens a dialog or sheet: run once the menu has closed, so the two do not fight over focus. */
  opensDialog?: boolean;
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
  const registry = useMemo(() => ({ action: addEntry, notice: addNotice }), [addEntry, addNotice]);
  return (
    <RegistryContext.Provider value={registry}>
      <EntriesContext.Provider value={entries}>
        <NoticesContext.Provider value={notices}>{children}</NoticesContext.Provider>
      </EntriesContext.Provider>
    </RegistryContext.Provider>
  );
}

/**
 * Puts a control's action in the page's "⋯" menu (`null` leaves it out); outside `PageActions` it
 * does nothing. `inMenu` says whether the page has a menu.
 */
export function usePageAction(id: string, action: PageAction | null): { inMenu: boolean } {
  const registry = useContext(RegistryContext);
  const register = registry?.action;
  // Callbacks and icons change identity every render; the menu reads the latest through this.
  const latest = useRef(action);
  useLayoutEffect(() => {
    latest.current = action;
  });

  const present = action !== null;
  const { label = "", order = 0, href, checked, disabled, pending, opensDialog } = action ?? {};
  useEffect(() => {
    if (!register || !present) return;
    return register(id, {
      id,
      label,
      order,
      href,
      checked,
      disabled,
      pending,
      opensDialog,
      run: () => latest.current?.onSelect?.(),
      icon: () => latest.current?.icon,
    });
  }, [register, present, id, label, order, href, checked, disabled, pending, opensDialog]);

  return { inMenu: registry !== null };
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

/** The "⋯" button and its menu, for phones only (`sm:hidden`). */
export function PageActionsMenu({ className }: { className?: string }) {
  const t = useTranslations("PageActions");
  const entries = useContext(EntriesContext);
  const sorted = useMemo(() => [...entries.values()].sort((a, b) => a.order - b.order), [entries]);
  const busy = sorted.some((entry) => entry.pending);
  // A dialog item's action waits for the menu to close (see `opensDialog`).
  const deferred = useRef<(() => void) | null>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={t("more")}
          aria-busy={busy}
          className={cn("sm:hidden", className)}
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
          const separated =
            previous !== undefined &&
            Math.floor(previous.order / 10) !== Math.floor(entry.order / 10);
          return (
            <MenuEntry
              key={entry.id}
              entry={entry}
              separated={separated}
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
  separated,
  onDeferred,
}: {
  entry: Entry;
  separated: boolean;
  onDeferred: (run: () => void) => void;
}) {
  const icon = entry.icon();
  const item =
    entry.checked !== undefined ? (
      <DropdownMenuCheckboxItem
        checked={entry.checked}
        disabled={entry.disabled}
        onCheckedChange={() => entry.run()}
        onSelect={(event) => event.preventDefault()}
      >
        {entry.label}
      </DropdownMenuCheckboxItem>
    ) : entry.href !== undefined ? (
      <DropdownMenuItem asChild>
        <Link href={entry.href as Route}>
          {icon}
          {entry.label}
        </Link>
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem
        disabled={entry.disabled || entry.pending}
        onSelect={() => (entry.opensDialog ? onDeferred(entry.run) : entry.run())}
      >
        {icon}
        {entry.label}
      </DropdownMenuItem>
    );
  return (
    <>
      {separated ? <DropdownMenuSeparator /> : null}
      {item}
    </>
  );
}
