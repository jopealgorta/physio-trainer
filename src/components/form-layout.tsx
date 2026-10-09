"use client";

import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The shared shape of every form: fields in `FormBody` (one width, one rhythm), short fields
 * paired with `FieldRow`, each label + control + hint in a `Field`, and the actions in a sticky
 * `FormFooter`: status on the left, `[Cancel] [Save]` on the right. See docs/architecture.md
 * Conventions.
 */
export function FormBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid max-w-2xl content-start gap-4", className)} {...props} />;
}

/** Two short fields side by side from `sm` up (first/last name, two dates...). */
export function FieldRow({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)} {...props} />;
}

/** A label, its control, and its hint or error. */
export function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid content-start gap-1.5", className)} {...props} />;
}

/**
 * The form's action bar, pinned to the bottom of whatever scrolls the form. `page`: a form in
 * the app's `<main>`, bleeding through its padding (keep in step with `(app)/layout.tsx`); its
 * content lines up with `FormBody` unless `wide` (an editor using the whole page).
 * `panel`: a form in a sheet or dialog whose scroll area is padded `px-6` and marked
 * `data-slot="form-scroll"` (globals.css keeps focused fields clear of the footer there, as it
 * does for the page).
 */
export function FormFooter({
  status,
  variant = "page",
  wide = false,
  className,
  children,
}: {
  /** "Saved", "Unsaved changes", a shortcut hint: said politely to screen readers. */
  status?: ReactNode;
  variant?: "page" | "panel";
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="form-footer"
      className={cn(
        "sticky bottom-0 z-10 border-t pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        variant === "page"
          ? "bg-background -mx-4 -mb-6 px-4 md:-mx-10 md:-mb-8 md:px-10"
          : "bg-popover -mx-6 px-6",
        className,
      )}
    >
      <div className={cn("flex items-center gap-3", variant === "page" && !wide && "max-w-2xl")}>
        {/* Always mounted: screen readers only announce changes to an existing live region. Not
            role="status": a form's own notices (a restored draft) keep that role to themselves. */}
        <p
          aria-live="polite"
          data-slot="form-status"
          className="text-muted-foreground mr-auto min-w-0 text-sm"
        >
          {status}
        </p>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

/** Leaves the form without saving: back to `href`, or `onClick` to close a sheet or dialog. */
export function FormCancel(props: { href: string } | { onClick: () => void }) {
  const t = useTranslations("Form");
  if ("href" in props) {
    return (
      <Button variant="outline" asChild>
        <Link href={props.href as Route}>{t("cancel")}</Link>
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" onClick={props.onClick}>
      {t("cancel")}
    </Button>
  );
}
