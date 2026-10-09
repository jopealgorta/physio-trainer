import { FormSkeleton, HeaderSkeleton, LoadingPage } from "@/components/skeletons";

export default function Loading() {
  return (
    <LoadingPage className="gap-6">
      <HeaderSkeleton back />
      <FormSkeleton fields={5} />
    </LoadingPage>
  );
}
