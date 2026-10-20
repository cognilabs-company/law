"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { RuntimeConfig } from "@/lib/services/marketRuntime";
import { IconChevronDown, IconEye } from "@/components/icons";
import { ServiceFacts } from "@/components/marketplace/runtime/ServiceFacts";
import { SELLER_PREVIEW_SECTIONS, factSections } from "@/components/marketplace/runtime/facts";

export default function SellerTermsPreview({ config, basePrice, currency, aiId }: { config: RuntimeConfig; basePrice: number; currency: string; aiId?: string }) {
  const t = useTranslations("marketplace.runtime");
  const uid = useId();
  if (!factSections(config, SELLER_PREVIEW_SECTIONS).length) return null;
  return (
    <details className="svterms" data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined}>
      <summary aria-describedby={`${uid}-h`}>
        <IconEye aria-hidden="true" />
        <span className="svterms__t">
          <b>{t("previewTitle")}</b>
          <small id={`${uid}-h`}>{t("previewLead")}</small>
        </span>
        <IconChevronDown aria-hidden="true" className="svterms__chev" />
      </summary>
      <div className="svterms__body">
        <ServiceFacts config={config} tone="assist" basePrice={basePrice} currency={currency} sections={SELLER_PREVIEW_SECTIONS} showScope />
      </div>
    </details>
  );
}
