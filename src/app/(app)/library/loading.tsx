import {
  CardGridSkeleton,
  HeaderSkeleton,
  LoadingPage,
  ToolbarSkeleton,
} from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingPage className="gap-8">
      <HeaderSkeleton description actions={2} />
      <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden content-start gap-2 md:grid">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
        <div className="grid content-start gap-6">
          <ToolbarSkeleton filters={2} />
          <CardGridSkeleton />
        </div>
      </div>
    </LoadingPage>
  );
}
