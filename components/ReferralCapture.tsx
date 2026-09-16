"use client";

import { useEffect } from "react";
import { captureReferral } from "@/lib/referral";

// The backend's referral link points at the home page (/?ref=CODE), so the
// code is remembered on whichever page the visitor lands on (T1A-08).
export default function ReferralCapture() {
  useEffect(() => {
    captureReferral(window.location.search);
  }, []);
  return null;
}
