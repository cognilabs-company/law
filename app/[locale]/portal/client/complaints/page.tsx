import { Suspense } from "react";
import ClientComplaints from "@/components/complaints/ClientComplaints";
import { Skeleton } from "@/components/portal/DataState";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="ppanel">
          <Skeleton rows={3} />
        </div>
      }
    >
      <ClientComplaints />
    </Suspense>
  );
}
