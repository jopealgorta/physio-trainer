"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { CategoryLeaf, CategoryNode } from "@/lib/category-tree";
import { libraryHref, type LibraryCategoryFilter, type LibraryFilters } from "@/lib/library-params";
import { cn } from "@/lib/utils";

function isActive(current: LibraryCategoryFilter, target: LibraryCategoryFilter) {
  if (current.kind !== target.kind) return false;
  return current.kind !== "category" || (target.kind === "category" && current.id === target.id);
}

function TreeLink({
  filters,
  category,
  label,
  count,
  className,
}: {
  filters: LibraryFilters;
  category: LibraryCategoryFilter;
  label: string;
  count?: number;
  className?: string;
}) {
  const active = isActive(filters.category, category);
  return (
    <Link
      href={libraryHref(filters, { category })}
      aria-current={active ? "page" : undefined}
      className={cn(
        "hover:bg-muted flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
        active && "bg-muted font-medium",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {count === undefined ? null : (
        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
      )}
    </Link>
  );
}

export function CategoryTree({ tree, filters }: { tree: CategoryNode[]; filters: LibraryFilters }) {
  const t = useTranslations("Library.tree");
  const baseId = useId();
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const current = filters.category;
    const open = new Set<string>();
    if (current.kind === "category") {
      for (const node of tree) {
        if (node.children.some((child) => child.id === current.id)) open.add(node.id);
      }
    }
    return open;
  });
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const child = (leaf: CategoryLeaf) => (
    <li key={leaf.id} className="flex">
      <TreeLink
        filters={filters}
        category={{ kind: "category", id: leaf.id }}
        label={leaf.name}
        count={leaf.activeCount}
        className="ml-6"
      />
    </li>
  );

  return (
    <nav aria-label={t("label")}>
      <ul className="grid gap-0.5">
        <li className="flex">
          <TreeLink filters={filters} category={{ kind: "all" }} label={t("all")} />
        </li>
        <li className="flex">
          <TreeLink filters={filters} category={{ kind: "none" }} label={t("uncategorised")} />
        </li>
        {tree.map((node) => {
          const open = expanded.has(node.id);
          const childrenId = `${baseId}-${node.id}`;
          return (
            <li key={node.id}>
              <div className="flex items-center gap-0.5">
                {node.children.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-expanded={open}
                    aria-controls={childrenId}
                    aria-label={t("toggle", { name: node.name })}
                    onClick={() => toggle(node.id)}
                  >
                    <ChevronRightIcon
                      aria-hidden
                      className={cn("transition-transform", open && "rotate-90")}
                    />
                  </Button>
                ) : (
                  <span aria-hidden className="size-6 shrink-0" />
                )}
                <TreeLink
                  filters={filters}
                  category={{ kind: "category", id: node.id }}
                  label={node.name}
                  count={node.activeCount}
                />
              </div>
              {open && node.children.length > 0 ? (
                <ul id={childrenId} className="grid gap-0.5">
                  {node.children.map(child)}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Separator className="my-2" />
      <ul>
        <li className="flex">
          <TreeLink filters={filters} category={{ kind: "archived" }} label={t("archived")} />
        </li>
      </ul>
    </nav>
  );
}
