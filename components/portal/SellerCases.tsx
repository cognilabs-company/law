"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { matchesSearch } from "@/lib/searchText";
import { useLocale, useTranslations } from "next-intl";
import { getMyCases, getLawyerClients, type BackendCase } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import CaseManageModal from "@/components/portal/CaseManageModal";
import { IconFileText, IconMapPin, IconUser } from "@/components/icons";
import { statusLabel } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";

// Seller-side cases (lawyer / advocate). Shows the client's name as the
// primary label — never a raw case id/number. ?q= (the cabinet header's
// search) narrows the list.
export default function SellerCases({ ns }: { ns: string }) {
  return (
    <Suspense>
      <CasesList ns={ns} />
    </Suspense>
  );
}

function CasesList({ ns }: { ns: string }) {
  const q = (useSearchParams().get("q") ?? "").trim().slice(0, 200);
  const tx = useTranslations("lxShell.search");
  const path = usePathname();
  const t = useTranslations(ns);
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const [reloadKey, setReloadKey] = useState(0);
  const cases = useResource<BackendCase>(getMyCases, [reloadKey]);
  const clients = useResource(getLawyerClients, []);
  const [target, setTarget] = useState<(BackendCase & { clientName?: string }) | null>(null);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    clients.data.forEach((c) => c.id && m.set(c.id, c.name));
    return m;
  }, [clients.data]);

  const clientName = (c: BackendCase) => (c.clientUserId ? nameById.get(c.clientUserId) : "") || "";
  const shown = q ? cases.data.filter((c) => matchesSearch([clientName(c), c.title, c.caseType, c.caseNumber, c.nextAction].filter(Boolean).join(" "), q)) : cases.data;
  const emptyTitle = t.has("empty") ? t("empty") : t("emptyTitle");

  return (
    <div className="ppanel" data-ai-target={cases.data.length ? undefined : "cases:list"}>
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{t("count", { n: shown.length })}</span>
      </div>
      {q ? (
        <p className="advmuted">
          {tx("findSeller", { q })} · <Link href={path}>{tx("clear")}</Link>
        </p>
      ) : null}
      {cases.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !shown.length ? (
        <EmptyState icon={<IconFileText />} title={emptyTitle} text={t("emptyText")} />
      ) : (
        <div className="pcards" data-ai-target="cases:list" data-ai-label={t("title")}>
          {shown.map((c) => {
            const name = clientName(c);
            const primary = name || c.caseType || c.title || t("title");
            const meta = [name ? c.caseType : "", statusLabel(tcm, c.stage), c.nextAction, c.deadlineAt ? shortDateTime(c.deadlineAt, locale) : ""].filter(Boolean).join(" · ");
            return (
              <button className="pcase pcase--btn" key={c.id} type="button" onClick={() => setTarget({ ...c, clientName: name })}>
                <div className="pcase__h">
                  <span className="pcase__client">
                    <IconUser />
                    {primary}
                  </span>
                  <span className="advmuted">{statusLabel(tcm, c.status)}</span>
                </div>
                {meta ? (
                  <small>
                    <IconMapPin />
                    {meta}
                  </small>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <CaseManageModal target={target} onClose={() => setTarget(null)} onSaved={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}
