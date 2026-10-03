"use client";

import { DumbbellIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { YouTubePreview } from "@/components/library/youtube-preview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/lib/use-media-query";
import type { PatientItem } from "@/server/patient/view";

/**
 * One exercise, bigger (spec 19): its first video playing at once (the patient tapped to watch
 * it), the other videos click-to-play, then the prescription, notes and instructions. A bottom
 * sheet on phones, a dialog from `sm` up.
 */
export function ExerciseDetail({
  item,
  prescription,
  open,
  onOpenChange,
}: {
  item: PatientItem;
  prescription: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Patient");
  const locale = useLocale();
  const sheet = useIsMobile();
  const description = t("exercise.detailTitle", { name: item.name });
  const closeButton = (className: string) => (
    <Button
      variant="ghost"
      size="icon"
      className={`absolute size-10 ${className}`}
      aria-label={t("logging.close")}
    >
      <XIcon aria-hidden />
    </Button>
  );

  if (sheet) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          // Portalled out of the patient page: carries its branding scope and language itself.
          data-brand="patient"
          lang={locale}
          className="mx-auto max-h-[90dvh] max-w-2xl rounded-t-2xl text-sm"
        >
          <DrawerHeader className="relative pr-14">
            <DrawerTitle className="text-lg wrap-anywhere">{item.name}</DrawerTitle>
            <DrawerDescription className="sr-only">{description}</DrawerDescription>
            <DrawerClose asChild>{closeButton("top-3 right-3")}</DrawerClose>
          </DrawerHeader>
          {/* The drawer itself cannot scroll (vaul owns its gestures); this inner box does. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <DetailBody item={item} prescription={prescription} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-brand="patient"
        lang={locale}
        showCloseButton={false}
        className="max-h-[90dvh] gap-3 overflow-y-auto p-6 text-sm sm:max-w-xl"
      >
        <div className="relative pr-12">
          <DialogTitle className="text-lg font-semibold wrap-anywhere">{item.name}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          <DialogClose asChild>{closeButton("-top-1.5 -right-2")}</DialogClose>
        </div>
        <DetailBody item={item} prescription={prescription} />
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ item, prescription }: { item: PatientItem; prescription: string }) {
  const t = useTranslations("Patient");
  const [first, ...others] = item.media;
  return (
    <div className="grid gap-4">
      {first ? (
        <YouTubePreview
          videoId={first.videoId}
          isShort={first.isShort}
          title={item.name}
          className="mx-auto"
          autoPlay
        />
      ) : (
        <div className="bg-muted text-muted-foreground flex h-28 w-full flex-col items-center justify-center gap-2 rounded-lg">
          <DumbbellIcon aria-hidden className="size-8" />
          <p className="text-sm">{t("exercise.noVideo")}</p>
        </div>
      )}
      {prescription ? (
        <p className="bg-muted w-fit rounded-md px-2 py-1 text-sm font-medium">{prescription}</p>
      ) : null}
      {item.notes ? (
        <p className="text-sm wrap-anywhere whitespace-pre-line">
          <span className="font-medium">{t("exercise.notes")}: </span>
          {item.notes}
        </p>
      ) : null}
      {item.instructions ? (
        <section className="grid gap-1">
          <h3 className="text-sm font-semibold">{t("exercise.instructions")}</h3>
          <p className="text-muted-foreground text-sm wrap-anywhere whitespace-pre-line">
            {item.instructions}
          </p>
        </section>
      ) : null}
      {others.map((media, index) => (
        <YouTubePreview
          key={media.videoId}
          videoId={media.videoId}
          isShort={media.isShort}
          title={t("exercise.thumbnailAlt", { name: item.name, number: index + 2 })}
          className="mx-auto"
        />
      ))}
    </div>
  );
}
