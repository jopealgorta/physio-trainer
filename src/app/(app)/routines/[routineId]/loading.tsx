import { FormSkeleton, ListSkeleton, LoadingPage } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** The routine editor: header form and exercise list, with the picker beside it on desktop. */
export default function Loading() {
  return (
    <LoadingPage>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 gap-4">
          <FormSkeleton fields={3} footer={false} className="max-w-none" />
          <ListSkeleton rows={4} />
        </div>
        <div className="hidden gap-3 rounded-lg border p-4 lg:grid">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-full" />
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </LoadingPage>
  );
}
