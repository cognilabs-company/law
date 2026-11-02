"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { shortDateTime } from "@/lib/date";
import { toast } from "@/lib/toast";
import { approveSms, crmCan, listLeadSms, smsEditable, type CrmLead, type CrmSms } from "@/lib/services/crm";
import { useLeadFeed } from "@/components/crm/useLeadFeed";
import { prettyPhone } from "../../now/feed";
import { Field } from "../../panel/bits";
import { IcArrowRight, IcCheck, IcClock, IcRefresh } from "../../icons";
import { IcAlert, IcChat, IcEdit } from "../misc/icons";
import { Card, Empty, Failed, Kpi, KpiRow, RefreshButton, Seg, Skel, type Tone } from "../misc/ui";
import { crmHref, type CrmSectionProps } from "../nav";
import { useCrmErr } from "../leads/util";

const MAX = 1000;

const TONE: Record<string, Tone> = {
  draft: "info",
  scheduled: "info",
  approved: "info",
  sent: "ok",
  delivered: "ok",
  cancelled: "mute",
  failed: "hot",
  provider_configuration_required: "hot",
};

type Row = { lead: CrmLead; item: CrmSms };

export default function CrmSmsX({ meta }: CrmSectionProps) {
  const t = useTranslations("crm.smsPage");
  const ts = useTranslations("crm.sms");
  const locale = useLocale();
  const crmErr = useCrmErr();
  const all = crmCan(meta, "crm.leads.view_all");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const feed = useLeadFeed<CrmSms>(meta, scope, (id, signal) => listLeadSms(id, signal), (n) => n === "crm.call.completed" || n.startsWith("crm.automation") || n === "crm.lead.assigned");
  const [busy, setBusy] = useState("");
  const [patched, setPatched] = useState<Record<string, CrmSms>>({});
  const rows: Row[] = (feed.rows ?? []).map((r) => ({ ...r, item: patched[r.item.id] ?? r.item }));
  const waiting = rows.filter((r) => smsEditable(r.item));
  const blocked = rows.filter((r) => r.item.status === "provider_configuration_required" || r.item.status === "failed");
  const recent = rows
    .filter((r) => !smsEditable(r.item) && r.item.status !== "provider_configuration_required" && r.item.status !== "failed")
    .sort((a, b) => Date.parse(b.item.updatedAt || b.item.createdAt) - Date.parse(a.item.updatedAt || a.item.createdAt))
    .slice(0, 20);
  const can = crmCan(meta, "crm.sms.manage");

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

  const group = (list: Row[], empty: string) =>
    list.length ? (
      <ol className="opx-cm-smslist">
        {list.map((r) => (
          <li key={r.item.id}>
            <SmsItem row={r} can={can} busy={busy === r.item.id} locked={!!busy && busy !== r.item.id} onApprove={approve} locale={locale} />
          </li>
        ))}
      </ol>
    ) : (
      <p className="opx-cm-none">{empty}</p>
    );

  return (
    <div className="opx-cm" data-ai-target="callcenter:crm:sms">
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
        <p className="opx-cm-tel" data-on="">
          <span className="opx-cm-tel__ic" aria-hidden="true">
            <IcChat size={16} />
          </span>
          <span>{ts("autoRule", { n: meta.noAnswerSmsDelaySec ?? 180 })}</span>
        </p>
        <RefreshButton onClick={feed.reload} />
      </div>

      {feed.err && !feed.rows ? (
        <Failed title={t("failed")} text={crmErr(feed.err)} retry={t("retry")} onRetry={feed.reload} />
      ) : !feed.rows ? (
        <Skel heights={[96, 140, 260]} />
      ) : !rows.length ? (
        <div className="opx-cm-card">
          <Empty icon={<IcChat size={24} />} title={t("empty")} text={t("emptyText")} />
        </div>
      ) : (
        <>
          <KpiRow>
            <Kpi icon={<IcClock size={20} />} label={t("waiting")} value={waiting.length} tone={waiting.length ? "warn" : undefined} />
            <Kpi icon={<IcAlert size={20} />} label={t("blocked")} value={blocked.length} tone={blocked.length ? "hot" : "ok"} />
            <Kpi icon={<IcChat size={20} />} label={t("recent")} value={recent.length} tone="info" />
          </KpiRow>
          <div className="opx-cm-split">
            <div className="opx-cm-col">
              <Card icon={<IcClock size={17} />} title={t("waiting")} count={waiting.length}>
                {group(waiting, t("noWaiting"))}
              </Card>
              <Card icon={<IcAlert size={17} />} title={t("blocked")} count={blocked.length}>
                {group(blocked, t("noBlocked"))}
              </Card>
            </div>
            <Card icon={<IcChat size={17} />} title={t("recent")} count={recent.length}>
              {group(recent, t("noRecent"))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SmsItem({ row, can, busy, locked, onApprove, locale }: { row: Row; can: boolean; busy: boolean; locked: boolean; onApprove: (s: CrmSms, text?: string) => Promise<void>; locale: string }) {
  const t = useTranslations("crm.sms");
  const s = row.item;
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(s.body);
  const st = t.has(`state.${s.status}`) ? s.status : "other";
  const auto = /no_answer|automation|auto/.test(s.origin);
  const tone = TONE[s.status] ?? "mute";
  return (
    <article className="opx-cm-sms" data-s={st}>
      <Link className="opx-cm-sms__lead" href={crmHref("leads", { lead: row.lead.id, pane: "sms" })}>
        <span>{[row.lead.workId, row.lead.customer?.name].filter(Boolean).join(" · ")}</span>
        <IcArrowRight size={14} />
      </Link>
      <div className="opx-cm-sms__head">
        <span className="opx-pill opx-cm-sms__st" data-tone={tone}>
          {s.status === "provider_configuration_required" ? <IcAlert size={13} /> : s.status === "delivered" || s.status === "sent" ? <IcCheck size={13} /> : <IcClock size={13} />}
          {s.status === "provider_configuration_required" ? t("noProvider") : t(`state.${st}`)}
        </span>
        {auto ? (
          <em className="opx-pill" data-tone="mute">
            {t("auto")}
          </em>
        ) : null}
        <small className="opx-num">{[s.to.startsWith("+") ? prettyPhone(s.to) : s.to, s.createdAt ? shortDateTime(s.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
      </div>
      {edit ? <Field label={t("text")} value={text} onChange={(v) => setText(v.slice(0, MAX))} max={MAX} multiline rows={3} /> : <p className="opx-cm-sms__body">{s.body}</p>}
      {s.status === "scheduled" && s.scheduledAt ? <small className="opx-cm-sms__meta">{t("scheduledAt", { at: shortDateTime(s.scheduledAt, locale) })}</small> : null}
      {s.status === "cancelled" && auto ? <small className="opx-cm-sms__meta">{t("autoCancelled")}</small> : null}
      {s.status === "provider_configuration_required" ? <small className="opx-cm-sms__meta">{t("noProviderText")}</small> : null}
      {s.status === "failed" && s.error ? <small className="opx-cm-sms__meta is-bad">{s.error}</small> : null}
      {s.status === "delivered" && s.deliveredAt ? <small className="opx-cm-sms__meta">{t("deliveredAt", { at: shortDateTime(s.deliveredAt, locale) })}</small> : null}
      {can && smsEditable(s) ? (
        <div className="opx-cm-sms__acts">
          {edit ? (
            <>
              <button
                type="button"
                className="opx-pbtn opx-cm-sm"
                onClick={() => {
                  setEdit(false);
                  setText(s.body);
                }}
                disabled={busy}
              >
                {t("cancel")}
              </button>
              <button type="button" className="opx-pbtn opx-pbtn--main opx-cm-sm" onClick={() => void onApprove(s, text).then(() => setEdit(false))} disabled={busy || locked || !text.trim()} aria-busy={busy || undefined}>
                <IcCheck size={15} />
                {t("approveEdited")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="opx-pbtn opx-cm-sm" onClick={() => setEdit(true)} disabled={busy || locked}>
                <IcEdit size={15} />
                {t("edit")}
              </button>
              <button type="button" className="opx-pbtn opx-pbtn--main opx-cm-sm" onClick={() => void onApprove(s)} disabled={busy || locked} aria-busy={busy || undefined}>
                <IcCheck size={15} />
                {t("approve")}
              </button>
            </>
          )}
        </div>
      ) : null}
      {can && s.status === "provider_configuration_required" ? (
        <div className="opx-cm-sms__acts">
          <button type="button" className="opx-pbtn opx-cm-sm" onClick={() => void onApprove(s)} disabled={busy || locked} aria-busy={busy || undefined}>
            <IcRefresh size={15} />
            {t("retrySend")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
