import { FormSkeleton, LoadingPage } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** The plan page: title, details form and the week board (one column per day). */
export default function Loading() {
  return (
    <LoadingPage>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-36" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <Skeleton className="h-8 w-56 max-w-full" />
      <FormSkeleton fields={2} footer={false} className="max-w-none" />
      <div className="grid gap-3 lg:auto-cols-[minmax(11rem,1fr)] lg:grid-flow-col">
        {[0, 1, 2, 3, 4, 5, 6].map((index) => (
          <Skeleton key={index} className="h-40" />
        ))}
      </div>
    </LoadingPage>
  );
}
