"use client";

import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { usePageAction, usePageNotice } from "@/components/page-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deliverFile,
  downloadFile,
  fetchExportFile,
  prefersShareSheet,
  shareFile,
} from "@/lib/export-file";

type ExportFormat = "pdf" | "xlsx";
type ExportTarget = { kind: "routines" | "plans" | "customers"; id: string };

/**
 * Fetches an export and hands it over (see `src/lib/export-file`): one at a time, with an error
 * to show when it fails and, when the share sheet needed a fresh tap, the file to offer again.
 */
function useExport(target: ExportTarget) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState<File | null>(null);
  // State lands a render late; a second tap in between must not start a second export.
  const busy = useRef(false);

  async function run(format: ExportFormat, tracking: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    const query = format === "pdf" && !tracking ? "&tracking=0" : "";
    try {
      const file = await fetchExportFile(
        `/api/export/${target.kind}/${target.id}?format=${format}${query}`,
        `export.${format}`,
      );
      const outcome = await deliverFile(file, { share: prefersShareSheet() });
      if (outcome === "needsTap") setReady(file);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function shareReady() {
    if (!ready) return;
    // Called from the tap on "Share", so the browser allows it now.
    const outcome = await shareFile(ready);
    // Refused again: the file is not lost, it downloads.
    if (outcome === "failed" || outcome === "needsTap") downloadFile(ready);
    setReady(null);
  }

  return { pending, failed, ready, run, shareReady, dismissReady: () => setReady(null) };
}

/** "Export" dropdown (spec 14): PDF or Excel of a routine, plan or customer; tracking boxes optional. */
export function ExportMenu({ target }: { target: ExportTarget }) {
  const t = useTranslations("Export.menu");
  const [tracking, setTracking] = useState(true);
  const exporter = useExport(target);
  const { pending } = exporter;
  const { onCloseAutoFocus } = usePageAction("exportPdf", {
    label: t("pdf"),
    order: 20,
    pending,
    onSelect: () => void exporter.run("pdf", tracking),
  });
  usePageAction("exportXlsx", {
    label: t("xlsx"),
    order: 21,
    pending,
    onSelect: () => void exporter.run("xlsx", tracking),
  });
  usePageAction("exportTracking", {
    label: t("tracking"),
    order: 22,
    checked: tracking,
    onSelect: () => setTracking((value) => !value),
  });
  usePageNotice(
    "export",
    exporter.failed
      ? { text: t("error"), tone: "error" }
      : pending
        ? { text: t("exporting"), tone: "info" }
        : null,
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Not disabled while busy: focus comes back here after choosing an item. */}
          <Button type="button" variant="outline" aria-busy={exporter.pending}>
            {exporter.pending ? (
              <Loader2Icon aria-hidden className="animate-spin motion-reduce:animate-none" />
            ) : (
              <DownloadIcon aria-hidden />
            )}
            {t("trigger")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem
            disabled={exporter.pending}
            onSelect={() => void exporter.run("pdf", tracking)}
          >
            {t("pdf")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={exporter.pending}
            onSelect={() => void exporter.run("xlsx", tracking)}
          >
            {t("xlsx")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={tracking}
            onCheckedChange={(value) => setTracking(value === true)}
            onSelect={(event) => event.preventDefault()}
          >
            {t("tracking")}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {exporter.pending ? (
        <span role="status" className="sr-only">
          {t("exporting")}
        </span>
      ) : null}
      {exporter.failed ? (
        <p role="alert" className="text-destructive text-sm">
          {t("error")}
        </p>
      ) : null}
      <ExportReadyDialog
        file={exporter.ready}
        onShare={() => void exporter.shareReady()}
        onDismiss={exporter.dismissReady}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    </>
  );
}

/** Offers the fetched file again when the share sheet needed a fresh tap (iOS after a slow export). */
function ExportReadyDialog({
  file,
  onShare,
  onDismiss,
  onCloseAutoFocus,
}: {
  file: File | null;
  onShare: () => void;
  onCloseAutoFocus: (event: Event) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("Export.menu.ready");
  return (
    <Dialog open={file !== null} onOpenChange={(open) => (open ? undefined : onDismiss())}>
      <DialogContent showCloseButton={false} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {t("body", { name: file?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button type="button" onClick={onShare}>
            {t("share")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
