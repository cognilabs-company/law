"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { endNavPending } from "@/lib/navProgress";

// The bar at the top of the window while a navigation is pending (see
// lib/navProgress). Mounted once in the root layout.
export default function NavProgress() {
  const pathname = usePathname();
  useEffect(() => {
    endNavPending();
  }, [pathname]);
  return <div className="navprog" aria-hidden="true" />;
}
