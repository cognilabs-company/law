"use client";

import { useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconAlert, IconChat, IconInfo, IconRefresh } from "@/components/icons";
import { toast } from "@/lib/toast";
import { approveSms, crmCan, listLeadSms, smsEditable, type CrmMeta, type CrmSms } from "@/lib/services/crm";
import CrmFrame from "./CrmFrame";
import { Empty, useCrmError } from "./bits";
import { SmsRow } from "./LeadSms";
import { useLeadFeed } from "./useLeadFeed";

// The SMS section (contract 13cb257 §5, §15): drafts waiting for approval,
// messages the provider couldn't take (not configured yet — never shown as
// sent) and the latest ones, across the operator's open leads. Approving
// here is the same approve as on the lead.
export default function CrmSmsPage(): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame section="sms" title={t("smsPage.title")}>
      {(api) => <Board meta={api.meta} />}
    </CrmFrame>
  );
}

function Board({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.smsPage");
  const ts = useTranslations("crm.sms");
  const locale = useLocale();
  const crmErr = useCrmError();
  const all = crmCan(meta, "crm.leads.view_all");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const feed = useLeadFeed<CrmSms>(meta, scope, (id, signal) => listLeadSms(id, signal), (n) => n === "crm.call.completed" || n.startsWith("crm.automation") || n === "crm.lead.assigned");
  const [busy, setBusy] = useState("");
  const [patched, setPatched] = useState<Record<string, CrmSms>>({});
  const rows = (feed.rows ?? []).map((r) => ({ ...r, item: patched[r.item.id] ?? r.item }));
  const waiting = rows.filter((r) => smsEditable(r.item));
  const blocked = rows.filter((r) => r.item.status === "provider_configuration_required" || r.item.status === "failed");
  const recent = rows
    .filter((r) => !smsEditable(r.item) && r.item.status !== "provider_configuration_required" && r.item.status !== "failed")
    .sort((a, b) => Date.parse(b.item.updatedAt || b.item.createdAt) - Date.parse(a.item.updatedAt || a.item.createdAt))
    .slice(0, 20);
  const approve = async (s: CrmSms, text?: string) => {
    if (busy) return;
    setBusy(s.id);
    try {
      const saved = await approveSms(s.id, text);
      setPatched((p) => ({ ...p, [saved.id]: saved }));
      toast(saved.status === "provider_configuration_required" ? ts("noProvider") : ts.has(`state.${saved.status}`) ? ts(`state.${saved.status}`) : ts("state.other"), { tone: saved.status === "provider_configuration_required" || saved.status === "failed" ? "err" : "ok" });
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
      feed.reload();
    } finally {
      setBusy("");
    }
  };
  const can = crmCan(meta, "crm.sms.manage");
  const group = (title: string, list: typeof rows, empty: string, id: string) => (
    <section className="crm-card" aria-labelledby={id}>
      <h3 className="crm-card__h" id={id}>
        <IconChat aria-hidden="true" />
        {title}
        <small>{list.length}</small>
      </h3>
      {list.length ? (
        <ol className="crm-smslist">
          {list.map((r) => (
            <li key={r.item.id} className="crm-smsfeed">
              <Link className="crm-smsfeed__lead" href={`/admin/crm/leads/${encodeURIComponent(r.lead.id)}?pane=sms`}>
                {[r.lead.workId, r.lead.customer?.name].filter(Boolean).join(" · ")}
              </Link>
              <SmsRow s={r.item} can={can} busy={busy === r.item.id} locked={!!busy && busy !== r.item.id} onApprove={approve} locale={locale} as="div" />
            </li>
          ))}
        </ol>
      ) : (
        <p className="crm-sub">{empty}</p>
      )}
    </section>
  );
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
        <p className="crm-note crm-note--info" style={{ flex: 1, margin: 0 }}>
          <IconInfo aria-hidden="true" />
          {ts("autoRule", { n: meta.noAnswerSmsDelaySec ?? 180 })}
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
      ) : !rows.length ? (
        <div className="crm-card">
          <Empty icon={<IconChat />} title={t("empty")} text={t("emptyText")} />
        </div>
      ) : (
        <div className="crm-grid">
          <div className="crm-ws__col">
            {group(t("waiting"), waiting, t("noWaiting"), "crm-sp-w")}
            {group(t("blocked"), blocked, t("noBlocked"), "crm-sp-b")}
          </div>
          {group(t("recent"), recent, t("noRecent"), "crm-sp-r")}
        </div>
      )}
    </>
  );
}
