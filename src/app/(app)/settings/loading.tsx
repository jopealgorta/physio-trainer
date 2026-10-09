import { FormSkeleton, HeaderSkeleton, LoadingPage, TabsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <LoadingPage className="gap-6">
      <div className="grid gap-4">
        <HeaderSkeleton />
        <TabsSkeleton count={3} />
      </div>
      <FormSkeleton fields={4} />
    </LoadingPage>
  );
}
