import { FormSkeleton, HeaderSkeleton, LoadingPage, TabsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <div className="grid gap-3">
        <HeaderSkeleton />
        <TabsSkeleton count={3} />
      </div>
      <FormSkeleton fields={4} />
    </LoadingPage>
  );
}
