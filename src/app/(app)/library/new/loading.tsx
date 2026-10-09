import { FormSkeleton, HeaderSkeleton, LoadingPage } from "@/components/skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton back />
      <FormSkeleton fields={5} />
    </LoadingPage>
  );
}
