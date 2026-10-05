import { Suspense } from "react";
import OwnerWorkload from "@/components/org/OwnerWorkload";

type Props = { params: Promise<{ locale: string; orgId: string }> };

export default async function Page({ params }: Props) {
  const { orgId } = await params;
  return (
    <Suspense fallback={null}>
      <OwnerWorkload orgId={decodeURIComponent(orgId)} />
    </Suspense>
  );
}
