import { FormSkeleton, HeaderSkeleton, LoadingPage } from "@/components/skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton back actions={1} />
      <FormSkeleton fields={5} />
    </LoadingPage>
  );
}
