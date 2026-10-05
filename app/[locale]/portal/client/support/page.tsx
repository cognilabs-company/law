import { Suspense } from "react";
import ClientSupport from "@/components/support/ClientSupport";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClientSupport />
    </Suspense>
  );
}
