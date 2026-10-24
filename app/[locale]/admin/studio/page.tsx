"use client";

import { Suspense } from "react";
import { Home } from "@/components/admin/studio/sx/home/Home";

// Home reads ?retired= (a stale link to a removed constructor).
export default function AdminStudioPage() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}
