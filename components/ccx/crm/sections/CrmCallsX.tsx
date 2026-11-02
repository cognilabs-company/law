"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { shortDateTime } from "@/lib/date";
import { callEnded, crmCan, isFinalStatus, listLeadCalls, type CrmCall } from "@/lib/services/crm";
import { minutesUntil, useNow } from "@/lib/crm/useCrm";
import { useLeadFeed } from "@/components/crm/useLeadFeed";
import { prettyPhone } from "../../now/feed";
import { IcArrowRight, IcClock, IcPhone, IcWave } from "../../icons";
import { IcPlay } from "../misc/icons";
import { Card, Empty, Failed, Kpi, KpiRow, RefreshButton, Seg, Skel, When, type Tone } from "../misc/ui";
import { crmHref, type CrmSectionProps } from "../nav";
import { useCrmErr } from "../leads/util";

const callsHref = (leadId: string) => crmHref("leads", { lead: leadId, pane: "calls" });

const TONE: Record<string, Tone> = { completed: "ok", no_answer: "warn", failed: "hot", cancelled: "mute" };

export default function CrmCallsX({ meta }: CrmSectionProps) {
  const t = useTranslations("crm.callsPage");
  const tc = useTranslations("crm.calls");
  const tx = useTranslations("admin.ccx.crmMisc");
  const tp = useTranslations("admin.ccx.panel");
  const locale = useLocale();
  const now = useNow();
  const crmErr = useCrmErr();
  const all = crmCan(meta, "crm.leads.view_all");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const recordings = crmCan(meta, "crm.calls.recordings.view");
  const feed = useLeadFeed<CrmCall>(meta, scope, (id, signal) => listLeadCalls(id, recordings, signal), (n) => n.startsWith("crm.call.") || n === "crm.lead.claimed" || n === "crm.lead.assigned");
  const tel = meta.telephony;
  const rows = feed.rows ?? [];
  const live = rows.filter((r) => !callEnded(r.item));
  const recent = rows
    .filter((r) => callEnded(r.item))
    .sort((a, b) => Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt))
    .slice(0, 20);
  const due = feed.leads.filter((l) => l.nextActionAt && !isFinalStatus(meta, l.status)).sort((a, b) => Date.parse(a.nextActionAt) - Date.parse(b.nextActionAt));
  const toCall = due.slice(0, 12);
  const late = due.filter((l) => {
    const m = minutesUntil(l.nextActionAt, now);
    return m !== null && m < 0;
  }).length;
  const status = (s: string) => tc(`s.${tc.has(`s.${s}`) ? s : "other"}`);

  return (
    <div className="opx-cm" data-ai-target="callcenter:crm:calls">
      <div className="opx-cm-bar">
        {all ? (
          <Seg
            label={t("scope")}
            value={scope}
            options={[
              { value: "mine", label: t("scope_mine") },
              { value: "all", label: t("scope_all") },
            ]}
            onChange={setScope}
          />
        ) : null}
        <p className="opx-cm-tel" data-on={tel.enabled || undefined}>
          <span className="opx-cm-tel__ic" aria-hidden="true">
            <IcPhone size={16} />
          </span>
          <span>{tel.enabled ? tc("telOn") : tc("telOff")}</span>
          {tel.recordingConsentRequired ? (
            <em className="opx-pill" data-tone="warn">
              {t("consent")}
            </em>
          ) : null}
        </p>
        <RefreshButton onClick={feed.reload} />
      </div>

      {feed.err && !feed.rows ? (
        <Failed title={t("failed")} text={crmErr(feed.err)} retry={t("retry")} onRetry={feed.reload} />
      ) : !feed.rows ? (
        <Skel heights={[96, 140, 260]} />
      ) : (
        <>
          <KpiRow>
            <Kpi icon={<IcWave size={20} />} label={t("live")} value={live.length} tone={live.length ? "ok" : undefined} />
            <Kpi icon={<IcPhone size={20} />} label={t("toCall")} value={due.length} tone="info" />
            <Kpi icon={<IcClock size={20} />} label={tx("overdue")} value={late} tone={late ? "hot" : undefined} />
          </KpiRow>

          <div className="opx-cm-split">
            <div className="opx-cm-col">
              <Card icon={<i className="opx-cm-livedot" data-on={live.length ? "" : undefined} />} title={t("live")} count={live.length}>
                {live.length ? (
                  <ul className="opx-cm-list">
                    {live.map((r) => (
                      <li key={r.item.id}>
                        <Link className="opx-cm-row" href={callsHref(r.lead.id)}>
                          <span className="opx-cm-row__ic" data-tone="ok" aria-hidden="true">
                            <IcWave size={16} />
                          </span>
                          <span className="opx-cm-row__main">
                            <b>{r.lead.title || r.lead.workId}</b>
                            <small>{[r.lead.workId, r.lead.customer?.name, r.item.purpose].filter(Boolean).join(" · ")}</small>
                          </span>
                          <span className="opx-pill" data-tone="ok">
                            {status(r.item.status)}
                          </span>
                          <IcArrowRight size={16} className="opx-cm-go" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="opx-cm-none">{t("noLive")}</p>
                )}
              </Card>

              <Card icon={<IcPhone size={17} />} title={t("toCall")} count={toCall.length}>
                {toCall.length ? (
                  <ul className="opx-cm-due">
                    {toCall.map((l) => {
                      const phone = l.customer?.phone ?? "";
                      const dial = phone.replace(/[^\d+]/g, "");
                      return (
                        <li key={l.id}>
                          <span className="opx-cm-due__when">
                            <When at={l.nextActionAt} now={now} />
                          </span>
                          <span className="opx-cm-row__main">
                            <b>{l.title || l.workId}</b>
                            <small>{[l.workId, l.customer?.name].filter(Boolean).join(" · ")}</small>
                          </span>
                          {dial ? (
                            <a className="opx-cm-dial opx-num" href={`tel:${dial}`} aria-label={`${tp("call")}: ${prettyPhone(phone)}`}>
                              <IcPhone size={14} />
                              {prettyPhone(phone)}
                            </a>
                          ) : (
                            <span className="opx-cm-dial is-none" aria-hidden="true" />
                          )}
                          <Link className="opx-pbtn opx-cm-sm" href={callsHref(l.id)}>
                            {t("open")}
                            <IcArrowRight size={14} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Empty icon={<IcPhone size={24} />} title={t("noneDue")} text={t("noneDueText")} />
                )}
              </Card>
            </div>

            <Card icon={<IcClock size={17} />} title={t("recent")} count={recent.length}>
              {recent.length ? (
                <ol className="opx-cm-log">
                  {recent.map((r) => {
                    const c = r.item;
                    const facts = [tc(`dir.${c.direction === "inbound" ? "inbound" : "outbound"}`), c.durationSec ? tc("dur", { m: Math.floor(c.durationSec / 60), s: c.durationSec % 60 }) : ""].filter(Boolean).join(" · ");
                    return (
                      <li key={c.id} data-s={c.status}>
                        <span className="opx-cm-row__ic" data-tone={TONE[c.status] ?? "mute"} aria-hidden="true">
                          <IcPhone size={15} />
                        </span>
                        <div className="opx-cm-log__main">
                          <span className="opx-cm-log__top">
                            <b>{status(c.status)}</b>
                            {facts ? <small>{facts}</small> : null}
                          </span>
                          <small className="opx-num">{[r.lead.workId, r.lead.customer?.name, c.createdAt ? shortDateTime(c.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                          {c.summary ? <p>{c.summary}</p> : null}
                        </div>
                        <div className="opx-cm-log__acts">
                          {recordings && c.recordingUrl ? (
                            <a className="opx-pbtn opx-cm-sm" href={c.recordingUrl} target="_blank" rel="noreferrer">
                              <IcPlay size={15} />
                              {tc("recording")}
                            </a>
                          ) : null}
                          <Link className="opx-pbtn opx-cm-sm" href={callsHref(r.lead.id)}>
                            {t("open")}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <Empty icon={<IcPhone size={24} />} title={t("noRecent")} text={t("noRecentText")} />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
