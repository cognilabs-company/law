"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlert, IconHistory, IconRefresh } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { getLeadHistory, type CrmHistory, type CrmLead } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import { Avatar, Empty, StatusIcon, StatusPill, statusVar, useCrmError } from "./bits";

// The lead's cycles and status history (contract 13cb257 §2, §9): a
// reopened lead keeps every earlier cycle, read-only, with its final
// status; the current one is marked. Refetched after any change to the lead.
export function LeadHistory({ lead }: { lead: CrmLead }): ReactElement {
  const t = useTranslations("crm.history");
  const tsrc = useTranslations("crm.source");
  const locale = useLocale();
  const crmErr = useCrmError();
  const [h, setH] = useState<CrmHistory | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setH(await getLeadHistory(lead.id, signal));
        setErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.history", e);
        setErr(crmErr(e));
      }
    },
    [lead.id, crmErr],
  );
  // Read again when the lead itself changed (new lock_version).
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load, lead.lockVersion]);
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || (ev.leadId === lead.id && ev.invalidate.includes("lead"))) void load();
  });

  if (!h && err)
    return (
      <div className="crm-err" role="alert">
        <IconAlert aria-hidden="true" />
        <span>{err}</span>
        <button type="button" className="crm-btn crm-btn--sm" onClick={() => void load()}>
          <IconRefresh aria-hidden="true" />
          {t("retry")}
        </button>
      </div>
    );
  if (!h)
    return (
      <div aria-busy="true">
        <span className="crm-sk crm-sk--block" style={{ height: 110 }} />
        <span className="crm-sk crm-sk--block" style={{ height: 160 }} />
      </div>
    );
  return (
    <div className="crm-hist">
      {err ? <p className="crm-err">{err}</p> : null}
      <h4 className="crm-card__h">
        <IconRefresh aria-hidden="true" />
        {t("cycles")}
        <small>{h.cycles.length}</small>
      </h4>
      {h.cycles.length ? (
        <ol className="crm-cycles">
          {h.cycles.map((c) => {
            const current = c.id === h.currentCycleId;
            const end = c.terminalStatus;
            return (
              <li key={c.id} data-current={current || undefined} style={statusVar(end || lead.status)}>
                <i aria-hidden="true">{end ? <StatusIcon status={end} /> : <IconHistory />}</i>
                <span>
                  <b>
                    {t("cycleN", { n: c.sequence })}
                    {current ? <em className="crm-cycles__now">{t("current")}</em> : null}
                  </b>
                  <small>
                    {[c.source ? (tsrc.has(c.source) ? tsrc(c.source) : tsrc("other")) : "", c.openedAt ? t("opened", { at: shortDateTime(c.openedAt, locale) }) : "", c.closedAt ? t("closed", { at: shortDateTime(c.closedAt, locale) }) : ""].filter(Boolean).join(" · ")}
                  </small>
                  {c.inquiry ? <p>{c.inquiry}</p> : null}
                  {c.reason ? <small className="crm-muted">{t("reason", { text: c.reason })}</small> : null}
                </span>
                {end ? <StatusPill status={end} /> : <span className="crm-pill" style={{ ["--sc" as string]: "var(--crm-acc)" }}>{t("open")}</span>}
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty icon={<IconRefresh />} title={t("noCycles")} />
      )}
      <h4 className="crm-card__h">
        <IconHistory aria-hidden="true" />
        {t("statusHistory")}
        <small>{h.events.length}</small>
      </h4>
      {h.events.length ? (
        <ol className="crm-shist">
          {h.events.map((e) => (
            <li key={e.id}>
              <Avatar name={e.actor?.name ?? ""} title={e.actor?.name || t("system")} />
              <span>
                <b>{e.title || t("change")}</b>
                {e.body ? <small>{e.body}</small> : null}
                <small className="crm-muted">{[e.actor?.name || t("system"), e.createdAt ? shortDateTime(e.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="crm-sub">{t("noEvents")}</p>
      )}
    </div>
  );
}
