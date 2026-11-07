import { setRequestLocale } from "next-intl/server";
import { landingSans, landingSerif } from "@/components/landing/fonts";
import "@/components/landing/landing.css";
import LandingDefs from "@/components/landing/LandingDefs";
import LandingHero from "@/components/landing/LandingHero";
import LandingFinder from "@/components/landing/LandingFinder";
import LandingManifesto from "@/components/landing/LandingManifesto";
import LandingProblem from "@/components/landing/LandingProblem";
import LandingBand from "@/components/landing/LandingBand";
import LandingAi from "@/components/landing/LandingAi";
import LandingStages from "@/components/landing/LandingStages";
import LandingServices from "@/components/landing/LandingServices";
import LandingBenefits from "@/components/landing/LandingBenefits";
import LandingLawyers from "@/components/landing/LandingLawyers";
import LandingWarranty from "@/components/landing/LandingWarranty";
import LandingSubscription from "@/components/landing/LandingSubscription";
import LandingFaq from "@/components/landing/LandingFaq";
import LandingFinalCta from "@/components/landing/LandingFinalCta";
import LandingMotion from "@/components/landing/LandingMotion";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    // One plain root: React removes it whole when leaving the page, which keeps
    // pinned sections safe. Only real data here: the lawyers come from the
    // backend, and the page carries no invented counters or quotes.
    <div className={`lhome ${landingSans.variable} ${landingSerif.variable}`}>
      <LandingDefs />
      {/* Attention */}
      <LandingHero />
      <LandingFinder />
      {/* Problem / Need */}
      <LandingManifesto />
      <LandingProblem />
      <LandingBand />
      {/* Solution */}
      <LandingAi />
      <LandingStages />
      <LandingServices />
      {/* Benefits */}
      <LandingBenefits />
      {/* Trust */}
      <LandingLawyers />
      <LandingWarranty />
      {/* Offer */}
      <LandingSubscription />
      {/* Objection handling */}
      <LandingFaq />
      {/* Main CTA */}
      <LandingFinalCta />
      <span className="lh-cursor" aria-hidden="true">
        <b />
      </span>
      <LandingMotion />
    </div>
  );
}
