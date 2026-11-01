"use client";

import { useEffect } from "react";
import { captureReferral } from "@/lib/referral";
import { captureAttribution, currentLanding } from "@/lib/attribution";
import { whenConsented } from "@/lib/consent";

// The backend's referral link points at the home page (/?ref=CODE), so the
// code is remembered on whichever page the visitor lands on (T1A-08).
// Both are marketing storage: kept only once the visitor allows marketing,
// then from the page the visit started on, even if they allow it later.
export default function ReferralCapture() {
  useEffect(() => {
    const landing = currentLanding();
    return whenConsented("marketing", () => {
      captureReferral(landing.search);
      captureAttribution(landing); // T1A-05 UTM / landing / device for CRM leads
    });
  }, []);
  return null;
}
