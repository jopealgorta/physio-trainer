import { HeaderSkeleton, ListSkeleton, LoadingPage, ToolbarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton description actions={1} />
      <div className="grid gap-6">
        <ToolbarSkeleton filters={1} />
        <ListSkeleton rows={6} />
      </div>
    </LoadingPage>
  );
}
