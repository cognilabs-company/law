"use client";

import { Suspense } from "react";
import RobotRuns from "@/components/crm/robots/RobotRuns";

// Robot runs (ROP contract §18): filters read ?status=, ?rule= and ?lead=.
export default function AdminCrmRobotRuns() {
  return (
    <Suspense fallback={null}>
      <RobotRuns />
    </Suspense>
  );
}
