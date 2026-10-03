import { HeaderSkeleton, ListSkeleton, LoadingPage, TabsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton back description actions={1} />
      <TabsSkeleton count={5} />
      <ListSkeleton rows={3} />
    </LoadingPage>
  );
}
