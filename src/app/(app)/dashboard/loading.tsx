import { HeaderSkeleton, LoadingPage, PanelSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton description />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <PanelSkeleton className="lg:col-span-2" />
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </LoadingPage>
  );
}
