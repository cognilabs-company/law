"use client";

import { useEffect } from "react";
import { captureReferral } from "@/lib/referral";
import { captureAttribution } from "@/lib/attribution";

// The backend's referral link points at the home page (/?ref=CODE), so the
// code is remembered on whichever page the visitor lands on (T1A-08).
export default function ReferralCapture() {
  useEffect(() => {
    captureReferral(window.location.search);
    captureAttribution(); // T1A-05 UTM / landing / device for CRM leads
  }, []);
  return null;
}
