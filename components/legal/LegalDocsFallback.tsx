"use client";

import { useTranslations } from "next-intl";
import { useResource } from "@/lib/useResource";
import { currentConsents, listLegalConsents } from "@/lib/services/backend";
import { EmptyState, Skeleton } from "@/components/portal/DataState";
import LegalDocument from "./LegalDocument";
import LegalDocList from "./LegalDocList";

// The server fetch failed when the ISR page was generated (API down, or the
// build host can't reach it) → load the documents in the browser through the
// proxy instead. Never throws.
export default function LegalDocsFallback({ slug }: { slug?: string }) {
  const t = useTranslations("legal");
  const res = useResource(() => listLegalConsents().then(currentConsents), []);

  if (res.status === "ready" && !slug) return <LegalDocList docs={res.data} />;
  const doc = slug && res.status === "ready" ? res.data.find((d) => d.slug === slug) : undefined;
  if (doc) return <LegalDocument doc={doc} all={res.data} />;

  return (
    <section className="sec legal">
      <div className="wrap legal__in">
        {res.status === "loading" ? (
          <Skeleton rows={4} />
        ) : res.status === "error" ? (
          <EmptyState title={t("unavailableTitle")} text={t("unavailableText")} />
        ) : (
          <EmptyState title={t("notFoundTitle")} text={t("notFoundText")} />
        )}
      </div>
    </section>
  );
}
