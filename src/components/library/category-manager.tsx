"use client";

import { FolderTreeIcon, GripVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent, type KeyboardEvent } from "react";

import { SortableList } from "@/components/sortable/sortable-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CategoryLeaf, CategoryNode } from "@/lib/category-tree";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/library-limits";
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
  reorderCategoriesAction,
} from "@/server/library/actions";
import type { CategoryError } from "@/server/library/schemas";

type ErrorKey = "nameRequired" | "nameTooLong" | "nameTaken" | "notFound" | "tooDeep" | "unknown";

function errorKey(error: CategoryError): ErrorKey {
  if (error === "parentNotFound") return "notFound";
  if (error === "mismatch" || error === "invalid") return "unknown";
  return error;
}

/** Marks inline inputs so Escape cancels them without closing the whole dialog. */
const INLINE_EDIT = "data-inline-edit";

function useErrorText() {
  const t = useTranslations("Library.categories.errors");
  return (key: ErrorKey) =>
    key === "nameTooLong" ? t(key, { max: CATEGORY_NAME_MAX_LENGTH }) : t(key);
}

function NameForm({
  initial = "",
  placeholder,
  submitLabel,
  inline,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  /** Rename / add-sub forms: autofocus and cancellable. */
  inline?: boolean;
  onSubmit: (name: string) => Promise<ErrorKey | null>;
  onCancel?: () => void;
}) {
  const t = useTranslations("Library.categories");
  const errorText = useErrorText();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      let failure: ErrorKey | null;
      try {
        failure = await onSubmit(value);
      } catch {
        failure = "unknown";
      }
      if (failure) setError(failure);
      else if (!inline) setValue("");
    });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-1.5">
      <div className="flex gap-2">
        <Input
          {...(inline ? { [INLINE_EDIT]: "" } : {})}
          aria-label={t("nameLabel")}
          aria-invalid={error ? true : undefined}
          value={value}
          placeholder={placeholder}
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          autoFocus={inline}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {inline ? null : <PlusIcon aria-hidden />}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {errorText(error)}
        </p>
      ) : null}
    </form>
  );
}

function withoutKey<T extends { key: string }>(item: T): Omit<T, "key"> {
  const rest: Partial<T> = { ...item };
  delete rest.key;
  return rest as Omit<T, "key">;
}

type Editing = { kind: "rename"; id: string } | { kind: "sub"; parentId: string };

type Ctx = {
  t: ReturnType<typeof useTranslations>;
  editing: Editing | null;
  setEditing: (editing: Editing | null) => void;
  run: (
    call: () => Promise<{ ok: true } | { ok: false; error: CategoryError }>,
  ) => Promise<ErrorKey | null>;
  setNotice: (notice: ErrorKey | null) => void;
  startTransition: (callback: () => Promise<void>) => void;
};

function Row({
  node,
  handle,
  top,
  subCount,
  ctx,
}: {
  node: CategoryLeaf;
  handle: Record<string, unknown>;
  top: boolean;
  subCount: number | null;
  ctx: Ctx;
}) {
  const { t, editing, setEditing, run } = ctx;
  const isRenaming = editing?.kind === "rename" && editing.id === node.id;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="cursor-grab touch-none"
        {...handle}
      >
        <GripVerticalIcon aria-hidden />
      </Button>
      {isRenaming ? (
        <div className="min-w-0 flex-1">
          <NameForm
            inline
            initial={node.name}
            submitLabel={t("save")}
            onCancel={() => setEditing(null)}
            onSubmit={async (name) => {
              const failure = await run(() => renameCategoryAction({ id: node.id, name }));
              if (!failure) setEditing(null);
              return failure;
            }}
          />
        </div>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate pt-1.5 text-sm font-medium">{node.name}</span>
          <Badge variant="secondary" className="mt-1.5">
            {node.activeCount}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("rename", { name: node.name })}
            onClick={() => setEditing({ kind: "rename", id: node.id })}
          >
            <PencilIcon aria-hidden />
          </Button>
          {top ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("addSub", { name: node.name })}
              onClick={() => setEditing({ kind: "sub", parentId: node.id })}
            >
              <PlusIcon aria-hidden />
            </Button>
          ) : null}
          <DeleteButton node={node} subCount={subCount} ctx={ctx} />
        </>
      )}
    </div>
  );
}

function DeleteButton({
  node,
  subCount,
  ctx,
}: {
  node: CategoryLeaf;
  subCount: number | null;
  ctx: Ctx;
}) {
  const { t, run, setNotice, startTransition } = ctx;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          aria-label={t("delete", { name: node.name })}
        >
          <Trash2Icon aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle", { name: node.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {subCount === null ? null : (
              <>
                {t("deleteSubcategories", { count: subCount })}
                <br />
              </>
            )}
            {t("deleteExercises", { count: node.totalCount })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setNotice(null);
              startTransition(async () => {
                const failure = await run(() => deleteCategoryAction(node.id));
                if (failure) setNotice(failure);
              });
            }}
          >
            {t("confirmDelete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CategoryManager({ tree }: { tree: CategoryNode[] }) {
  const t = useTranslations("Library.categories");
  const tLibrary = useTranslations("Library");
  const errorText = useErrorText();
  const router = useRouter();
  const [items, setItems] = useState(tree);
  const [prevTree, setPrevTree] = useState(tree);
  if (tree !== prevTree) {
    setPrevTree(tree);
    setItems(tree);
  }
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<ErrorKey | null>(null);
  const [, startTransition] = useTransition();
  const ctx: Ctx = { t, editing, setEditing, run, setNotice, startTransition };

  async function run(
    call: () => Promise<{ ok: true } | { ok: false; error: CategoryError }>,
  ): Promise<ErrorKey | null> {
    try {
      const result = await call();
      if (result.ok) {
        router.refresh();
        return null;
      }
      return errorKey(result.error);
    } catch {
      return "unknown";
    }
  }

  function reorder(parentId: string | null, orderedIds: string[]) {
    setNotice(null);
    startTransition(async () => {
      const failure = await run(() => reorderCategoriesAction({ parentId, orderedIds }));
      if (failure) {
        setNotice(failure);
        setItems(tree);
      }
    });
  }

  function reorderTop(next: (CategoryNode & { key: string })[]) {
    setItems(next.map(withoutKey));
    reorder(
      null,
      next.map((node) => node.id),
    );
  }

  function reorderChildren(parent: CategoryNode, next: (CategoryLeaf & { key: string })[]) {
    setItems((current) =>
      current.map((node) =>
        node.id === parent.id ? { ...node, children: next.map(withoutKey) } : node,
      ),
    );
    reorder(
      parent.id,
      next.map((leaf) => leaf.id),
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <FolderTreeIcon aria-hidden /> {tLibrary("manageCategories")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85svh] overflow-y-auto sm:max-w-lg"
        onEscapeKeyDown={(event) => {
          if ((event.target as HTMLElement | null)?.closest(`[${INLINE_EDIT}]`)) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <NameForm
          placeholder={t("addPlaceholder")}
          submitLabel={t("add")}
          onSubmit={(name) => run(() => createCategoryAction({ name, parentId: null }))}
        />
        {notice ? (
          <Alert variant="destructive">
            <AlertDescription>{errorText(notice)}</AlertDescription>
          </Alert>
        ) : null}
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <SortableList
            className="divide-y"
            items={items.map((node) => ({ ...node, key: node.id }))}
            label={(node) => node.name}
            onReorder={reorderTop}
            renderItem={(node, handle) => (
              <div>
                <Row node={node} handle={handle} top subCount={node.children.length} ctx={ctx} />
                {node.children.length > 0 ? (
                  <SortableList
                    className="ml-8 border-l pl-2"
                    items={node.children.map((leaf) => ({ ...leaf, key: leaf.id }))}
                    label={(leaf) => leaf.name}
                    onReorder={(next) => reorderChildren(node, next)}
                    renderItem={(leaf, leafHandle) => (
                      <Row node={leaf} handle={leafHandle} top={false} subCount={null} ctx={ctx} />
                    )}
                  />
                ) : null}
                {editing?.kind === "sub" && editing.parentId === node.id ? (
                  <div className="mb-2 ml-8 pl-2">
                    <NameForm
                      inline
                      placeholder={t("subPlaceholder")}
                      submitLabel={t("save")}
                      onCancel={() => setEditing(null)}
                      onSubmit={async (name) => {
                        const failure = await run(() =>
                          createCategoryAction({ name, parentId: node.id }),
                        );
                        if (!failure) setEditing(null);
                        return failure;
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )}
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">{t("done")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
