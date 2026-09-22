"use client";

import { useTranslations } from "next-intl";
import { useResource, useResourceOne } from "@/lib/useResource";
import { currentConsents, getLegalConsent, listLegalConsents, type ConsentDoc } from "@/lib/services/backend";
import { EmptyState, Skeleton } from "@/components/portal/DataState";
import LegalDocument from "./LegalDocument";
import LegalDocList from "./LegalDocList";

// The server fetch failed when the ISR page was generated (API down, or the
// build host can't reach it) → load the documents in the browser through the
// proxy instead. Never throws.
export default function LegalDocsFallback({ slug }: { slug?: string }) {
  const t = useTranslations("legal");
  const res = useResource(() => listLegalConsents().then(currentConsents), []);
  const summary = slug && res.status === "ready" ? res.data.find((d) => d.slug === slug) : undefined;
  // The list is body-less (2026-09-22 backend) — fetch the one document
  // actually being read for its real text; the summary (empty body) renders
  // immediately while this resolves, same "flash then fill in" as elsewhere.
  // Called unconditionally (rules-of-hooks) even on the /legal index render,
  // where summary is always undefined and this just resolves to null.
  const detail = useResourceOne<ConsentDoc | null>(
    () => (summary ? getLegalConsent(summary.id) : Promise.resolve(null)),
    [summary?.id],
  );

  if (res.status === "ready" && !slug) return <LegalDocList docs={res.data} />;
  const doc = summary ? (detail.data ?? summary) : undefined;
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
