"use client";

import { useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconAlert, IconArrowRight, IconPhone, IconRefresh } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { callEnded, crmCan, isFinalStatus, listLeadCalls, type CrmCall, type CrmMeta } from "@/lib/services/crm";
import { useNow } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Empty, WhenChip, useCrmError } from "./bits";
import { useLeadFeed } from "./useLeadFeed";

// The Calls section (contract 13cb257 §5, §14): calls in progress and the
// latest ones across the operator's open leads, and the leads whose next
// step is a call — each opens the lead's call pane to start, transcribe or
// complete a call. Telephony state comes from /crm/meta.
export default function CrmCallsPage(): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame section="calls" title={t("callsPage.title")}>
      {(api) => <Board meta={api.meta} />}
    </CrmFrame>
  );
}

function Board({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.callsPage");
  const tc = useTranslations("crm.calls");
  const locale = useLocale();
  const now = useNow();
  const crmErr = useCrmError();
  const all = crmCan(meta, "crm.leads.view_all");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const recordings = crmCan(meta, "crm.calls.recordings.view");
  const feed = useLeadFeed<CrmCall>(meta, scope, (id, signal) => listLeadCalls(id, recordings, signal), (n) => n.startsWith("crm.call.") || n === "crm.lead.claimed" || n === "crm.lead.assigned");
  const tel = meta.telephony;
  const href = (leadId: string) => `/admin/crm/leads/${encodeURIComponent(leadId)}?pane=calls`;
  const live = (feed.rows ?? []).filter((r) => !callEnded(r.item));
  const recent = (feed.rows ?? [])
    .filter((r) => callEnded(r.item))
    .sort((a, b) => Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt))
    .slice(0, 20);
  const toCall = feed.leads.filter((l) => l.nextActionAt && !isFinalStatus(meta, l.status)).sort((a, b) => Date.parse(a.nextActionAt) - Date.parse(b.nextActionAt)).slice(0, 12);

  return (
    <>
      <div className="crm-filters">
        {all ? (
          <span className="crm-seg" role="group" aria-label={t("scope")}>
            {(["mine", "all"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}>
                {t(`scope_${k}`)}
              </button>
            ))}
          </span>
        ) : null}
        <p className="crm-telline" data-on={tel.enabled || undefined} style={{ flex: 1 }}>
          <IconPhone aria-hidden="true" />
          <span>{tel.enabled ? tc("telOn") : tc("telOff")}</span>
          {tel.recordingConsentRequired ? <em>{t("consent")}</em> : null}
        </p>
      </div>
      {feed.err && !feed.rows ? (
        <div className="crm-card">
          <Empty
            icon={<IconAlert />}
            title={t("failed")}
            text={crmErr(feed.err)}
            action={
              <button type="button" className="crm-btn" onClick={feed.reload}>
                <IconRefresh aria-hidden="true" />
                {t("retry")}
              </button>
            }
          />
        </div>
      ) : !feed.rows ? (
        <>
          <span className="crm-sk crm-sk--block" style={{ height: 120 }} />
          <span className="crm-sk crm-sk--block" style={{ height: 220 }} />
        </>
      ) : (
        <div className="crm-grid">
          <div className="crm-ws__col">
            <section className="crm-card" aria-labelledby="crm-cp-live">
              <h3 className="crm-card__h" id="crm-cp-live">
                <span className="crm-livedot" aria-hidden="true" />
                {t("live")}
                <small>{live.length}</small>
              </h3>
              {live.length ? (
                <ul className="crm-feed">
                  {live.map((r) => (
                    <li key={r.item.id}>
                      <Link href={href(r.lead.id)}>
                        <b>{r.lead.title || r.lead.workId}</b>
                        <small>{[r.lead.workId, r.lead.customer?.name, r.item.purpose].filter(Boolean).join(" · ")}</small>
                        <IconArrowRight aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="crm-sub">{t("noLive")}</p>
              )}
            </section>
            <section className="crm-card" aria-labelledby="crm-cp-due">
              <h3 className="crm-card__h" id="crm-cp-due">
                <IconPhone aria-hidden="true" />
                {t("toCall")}
                <small>{toCall.length}</small>
              </h3>
              {toCall.length ? (
                <ul className="crm-feed">
                  {toCall.map((l) => (
                    <li key={l.id}>
                      <Link href={href(l.id)}>
                        <b>{l.title || l.workId}</b>
                        <small>{[l.workId, l.customer?.name, l.customer?.phone].filter(Boolean).join(" · ")}</small>
                        <WhenChip at={l.nextActionAt} now={now} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon={<IconPhone />} title={t("noneDue")} text={t("noneDueText")} />
              )}
            </section>
          </div>
          <section className="crm-card" aria-labelledby="crm-cp-recent">
            <h3 className="crm-card__h" id="crm-cp-recent">
              <IconPhone aria-hidden="true" />
              {t("recent")}
            </h3>
            {recent.length ? (
              <ol className="crm-calllog">
                {recent.map((r) => (
                  <li key={r.item.id} data-s={r.item.status}>
                    <i aria-hidden="true">
                      <IconPhone />
                    </i>
                    <span>
                      <b>{tc(`s.${tc.has(`s.${r.item.status}`) ? r.item.status : "other"}`)}</b>
                      <small>{[r.lead.workId, r.lead.customer?.name, r.item.createdAt ? shortDateTime(r.item.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                      {r.item.summary ? <p>{r.item.summary}</p> : null}
                    </span>
                    <Link className="crm-btn crm-btn--sm" href={href(r.lead.id)}>
                      {t("open")}
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty icon={<IconPhone />} title={t("noRecent")} text={t("noRecentText")} />
            )}
          </section>
        </div>
      )}
    </>
  );
}
