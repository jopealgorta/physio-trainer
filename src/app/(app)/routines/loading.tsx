import {
  HeaderSkeleton,
  ListSkeleton,
  LoadingPage,
  TabsSkeleton,
  ToolbarSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton />
      <TabsSkeleton count={2} />
      <div className="grid gap-6">
        <ToolbarSkeleton filters={2} />
        <ListSkeleton rows={6} />
      </div>
    </LoadingPage>
  );
}
