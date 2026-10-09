import { FormSkeleton, HeaderSkeleton, LoadingPage } from "@/components/skeletons";

export default function Loading() {
  return (
    <LoadingPage className="gap-6">
      <HeaderSkeleton back actions={1} />
      <FormSkeleton fields={5} />
    </LoadingPage>
  );
}
