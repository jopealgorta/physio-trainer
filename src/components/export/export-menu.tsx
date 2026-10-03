"use client";

import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useMenuOpened, usePageAction, usePageNotice } from "@/components/page-actions";
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
  SHARE_SHEET_QUERIES,
  shareFile,
} from "@/lib/export-file";
import { useMediaQuery } from "@/lib/use-media-query";

type ExportFormat = "pdf" | "xlsx";
type ExportTarget = { kind: "routines" | "plans" | "customers"; id: string };

/** How long an export error stays up when nothing else clears it. */
const ERROR_MS = 8000;

/** Touch screens and the installed app send exports to the share sheet (see export-file). */
function useShareSheet() {
  const touch = useMediaQuery(SHARE_SHEET_QUERIES[0]);
  const standalone = useMediaQuery(SHARE_SHEET_QUERIES[1]);
  return touch || standalone;
}

/**
 * Fetches an export and hands it to the share sheet (see `src/lib/export-file`): one at a time,
 * with an error to show when it fails and, when the share sheet needed a fresh tap, the file to
 * offer again.
 */
function useShareExport() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState<File | null>(null);
  // State lands a render late; a second tap in between must not start a second export or share.
  const busy = useRef(false);

  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => setFailed(false), ERROR_MS);
    return () => clearTimeout(timer);
  }, [failed]);

  async function run(url: string, fallbackName: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      const file = await fetchExportFile(url, fallbackName);
      const outcome = await deliverFile(file, { share: true });
      if (outcome === "needsTap") setReady(file);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function shareReady() {
    const file = ready;
    if (!file || busy.current) return;
    busy.current = true;
    // Closed before the share sheet opens, so a second tap has nothing to hit.
    setReady(null);
    try {
      // Called from the tap on "Share", so the browser allows it now.
      const outcome = await shareFile(file);
      // Refused again: the file is not lost, it downloads. (A share still open is left alone.)
      if (outcome === "failed" || outcome === "needsTap") downloadFile(file);
    } finally {
      busy.current = false;
    }
  }

  return {
    pending,
    failed,
    ready,
    run,
    shareReady,
    dismissReady: () => setReady(null),
    clearError: () => setFailed(false),
  };
}

/**
 * "Export" dropdown (spec 14): PDF or Excel of a routine, plan or customer; tracking boxes
 * optional. On a desktop the items are plain download links (the browser streams the file); on
 * touch screens and in the installed app the file is fetched and handed to the share sheet,
 * since a download there opens a viewer with no way back.
 */
export function ExportMenu({ target }: { target: ExportTarget }) {
  const t = useTranslations("Export.menu");
  const [tracking, setTracking] = useState(true);
  const share = useShareSheet();
  const exporter = useShareExport();
  const { pending } = exporter;

  const base = `/api/export/${target.kind}/${target.id}`;
  const hrefs = {
    pdf: `${base}?format=pdf${tracking ? "" : "&tracking=0"}`,
    xlsx: `${base}?format=xlsx`,
  } satisfies Record<ExportFormat, string>;
  const exportAs = (format: ExportFormat) => void exporter.run(hrefs[format], `export.${format}`);
  const menuItem = (format: ExportFormat, order: number) =>
    share
      ? { label: t(format), order, pending, onSelect: () => exportAs(format) }
      : { label: t(format), order, href: hrefs[format], download: true };

  const { onCloseAutoFocus } = usePageAction("exportPdf", menuItem("pdf", 20));
  usePageAction("exportXlsx", menuItem("xlsx", 21));
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
  useMenuOpened(exporter.clearError);

  const item = (format: ExportFormat) =>
    share ? (
      <DropdownMenuItem disabled={pending} onSelect={() => exportAs(format)}>
        {t(format)}
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem asChild>
        <a href={hrefs[format]} download>
          {t(format)}
        </a>
      </DropdownMenuItem>
    );

  return (
    <>
      <DropdownMenu onOpenChange={(open) => (open ? exporter.clearError() : undefined)}>
        <DropdownMenuTrigger asChild>
          {/* Not disabled while busy: focus comes back here after choosing an item. */}
          <Button type="button" variant="outline" aria-busy={pending}>
            {pending ? (
              <Loader2Icon aria-hidden className="animate-spin motion-reduce:animate-none" />
            ) : (
              <DownloadIcon aria-hidden />
            )}
            {t("trigger")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {item("pdf")}
          {item("xlsx")}
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
      {pending ? (
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
