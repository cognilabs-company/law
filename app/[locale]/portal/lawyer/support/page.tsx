import { Suspense } from "react";
import SupportHub from "@/components/support/SupportHub";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SupportHub role="lawyer" />
    </Suspense>
  );
}
