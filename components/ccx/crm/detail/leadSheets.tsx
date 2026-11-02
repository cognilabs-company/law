"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import {
  addLeadWatcher,
  assignLead,
  changeLeadStatus,
  crmCan,
  crmField,
  getCrmCustomer,
  getCrmLead,
  isFinalStatus,
  listCrmOperators,
  reopenCrmLead,
  resolveDuplicate,
  transferLead,
  updateCrmLead,
  type CrmLead,
  type CrmMeta,
  type CrmOperator,
} from "@/lib/services/crm";
import Sheet from "../../panel/Sheet";
import { Note, PanelFoot } from "../../panel/bits";
import { IcArrowRight, IcCheck, IcClock, IcRefresh, IcSearch } from "../../icons";
import { IcEdit, IcLink, IcUserPlus, IcUsers } from "./glyphs";
import { Avatar, DateTimeInput, Empty, SelectInput, Seg, SheetHead, Shim, StatusChip, StatusGlyph, TextArea, TextInput, fromLocal, inHours, toLocal } from "./kit";
import type { LeadWrite } from "./types";
import { useRegionName, useStatusName } from "../leads/util";

type Base = { lead: CrmLead; write: LeadWrite; onClose: () => void };

export function StatusSheet({ meta, lead, to, write, onClose }: Base & { meta: CrmMeta; to: string }) {
  const t = useTranslations("crm.sheet");
  const ts = useStatusName();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverField, setServerField] = useState("");
  const closing = isFinalStatus(meta, to);
  const needReason = to === "rejected";
  const reasonErr = (tried && needReason && !reason.trim()) || serverField === "reason" ? t("reasonNeeded") : "";
  const ok = async () => {
    setTried(true);
    if (busy || (needReason && !reason.trim())) return;
    setBusy(true);
    const done = await write(async (l) => {
      try {
        return await changeLeadStatus(l, to, reason, l.nextActionAt || null);
      } catch (e) {
        setServerField(crmField(e));
        throw e;
      }
    }, t("moved", { status: ts(to) }));
    setBusy(false);
    if (done) onClose();
  };
  const title = t("statusTitle", { status: ts(to) });
  return (
    <Sheet label={title} head={<SheetHead icon={<StatusGlyph status={to} size={20} />} title={title} sub={lead.workId} />} onClose={onClose} dirty={!!reason}>
      <div className="opx-pscroll">
        <div className="opx-cd-move">
          <StatusChip meta={meta} status={lead.status} />
          <IcArrowRight size={18} />
          <StatusChip meta={meta} status={to} />
        </div>
        <TextArea label={closing ? t("reasonClose") : t("reason")} value={reason} onChange={setReason} max={1000} rows={4} required={needReason} autoFocus error={reasonErr} hint={reasonErr ? undefined : needReason ? t("reasonRequired") : t("reasonHelp")} />
        {to === "won" ? <Note tone="warn">{t("wonNeedsPaid")}</Note> : null}
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={t("cancel")} primary={() => void ok()} primaryLabel={t("move")} busy={busy} danger={to === "rejected"} />
    </Sheet>
  );
}

export function ReopenSheet({ meta, lead, write, onClose }: Base & { meta: CrmMeta }) {
  const t = useTranslations("crm.reopen");
  const tsrc = useTranslations("crm.source");
  const tc = useTranslations("crm.sheet");
  const [inquiry, setInquiry] = useState("");
  const [source, setSource] = useState(lead.source || meta.sources[0] || "manual");
  const [reason, setReason] = useState("");
  const [operator, setOperator] = useState("");
  const [ops, setOps] = useState<CrmOperator[]>([]);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverField, setServerField] = useState("");
  const canAssign = crmCan(meta, "crm.leads.assign");
  useEffect(() => {
    if (!canAssign) return;
    const ctl = new AbortController();
    listCrmOperators("", ctl.signal).then(setOps, (e) => {
      if (!isAborted(e)) logApiError("crm.operators", e);
    });
    return () => ctl.abort();
  }, [canAssign]);
  const bad = inquiry.trim().length < 2 || serverField === "inquiry";
  const ok = async () => {
    setTried(true);
    if (busy || bad) return;
    setBusy(true);
    const done = await write(async (l) => {
      try {
        return await reopenCrmLead(l, { inquiry, source, reason, operatorId: operator });
      } catch (e) {
        setServerField(crmField(e));
        throw e;
      }
    }, t("done"));
    setBusy(false);
    if (done) onClose();
  };
  const sources = meta.sources.includes(source) ? meta.sources : [source, ...meta.sources];
  return (
    <Sheet label={t("title", { lead: lead.workId })} head={<SheetHead icon={<IcRefresh size={20} />} title={t("title", { lead: lead.workId })} sub={t("lead", { n: lead.cycleNumber + 1 })} />} onClose={onClose} dirty={!!inquiry || !!reason}>
      <div className="opx-pscroll">
        <TextArea label={t("inquiry")} value={inquiry} onChange={setInquiry} max={20000} rows={4} required autoFocus error={tried && bad ? t("inquiryNeed") : undefined} hint={t("inquiryHelp")} />
        <div className="opx-pgrid2">
          <SelectInput label={t("source")} value={source} onChange={setSource} options={sources.map((s) => ({ value: s, label: tsrc.has(s) ? tsrc(s) : tsrc("other") }))} />
          {canAssign ? <SelectInput label={t("operator")} value={operator} onChange={setOperator} options={[{ value: "", label: t("keepOperator") }, ...ops.map((o) => ({ value: o.id, label: o.name }))]} /> : null}
        </div>
        <TextInput label={t("reason")} value={reason} onChange={setReason} max={2000} placeholder={t("reasonPh")} />
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={tc("cancel")} primary={() => void ok()} primaryLabel={t("ok")} busy={busy} />
    </Sheet>
  );
}

export function NextSheet({ lead, write, onClose }: Base) {
  const t = useTranslations("crm.sheet");
  const ttl = useTranslations("crm.tl");
  const [next, setNext] = useState(() => toLocal(lead.nextActionAt));
  const [busy, setBusy] = useState(false);
  const [chip, setChip] = useState<number | null>(null);
  const ok = async () => {
    setBusy(true);
    const done = await write((l) => updateCrmLead(l, { nextActionAt: fromLocal(next) || null }), t("nextSaved"));
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Sheet label={t("nextTitle")} head={<SheetHead icon={<IcClock size={20} />} title={t("nextTitle")} sub={lead.workId} />} onClose={onClose}>
      <div className="opx-pscroll">
        <div className="opx-cd-chips" role="group" aria-label={t("next")}>
          {[1, 3, 24, 72].map((h) => (
            <button
              key={h}
              type="button"
              className="opx-cd-chip"
              aria-pressed={chip === h}
              onClick={() => {
                setNext(inHours(h));
                setChip(h);
              }}
            >
              {ttl("remindIn", { n: h })}
            </button>
          ))}
          <button
            type="button"
            className="opx-cd-chip"
            onClick={() => {
              setNext("");
              setChip(null);
            }}
          >
            {t("clearNext")}
          </button>
        </div>
        <DateTimeInput
          label={t("next")}
          value={next}
          onChange={(v) => {
            setNext(v);
            setChip(null);
          }}
        />
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={t("cancel")} primary={() => void ok()} primaryLabel={t("save")} busy={busy} />
    </Sheet>
  );
}

const URGENCIES = ["low", "normal", "high", "urgent"];

export function EditSheet({ meta, lead, write, onClose }: Base & { meta: CrmMeta }) {
  const t = useTranslations("crm.sheet");
  const tl = useTranslations("admin.ccx.crm.lang");
  const tsc = useTranslations("crm.score");
  const tn = useTranslations("crm.newLead");
  const regionName = useRegionName();
  const shownRegion = regionName(lead.region);
  const [f, setF] = useState({ title: lead.title, problem: lead.problem, region: shownRegion, urgency: lead.urgency || "normal", score: lead.score, language: lead.language });
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const ok = async () => {
    setTried(true);
    if (!f.title.trim() || busy) return;
    setBusy(true);
    const done = await write((l) => updateCrmLead(l, { ...f, region: lead.region && f.region.trim() === shownRegion ? lead.region : f.region }), t("saved"));
    setBusy(false);
    if (done) onClose();
  };
  const withCur = (list: string[], cur: string) => (cur && !list.includes(cur) ? [cur, ...list] : list);
  return (
    <Sheet label={t("editTitle")} head={<SheetHead icon={<IcEdit size={20} />} title={t("editTitle")} sub={lead.workId} />} onClose={onClose} dirty>
      <div className="opx-pscroll">
        <TextInput label={tn("titleLabel")} value={f.title} onChange={set("title")} required autoFocus error={tried && !f.title.trim() ? tn("titleRequired") : undefined} />
        <TextArea label={tn("problem")} value={f.problem} onChange={set("problem")} rows={5} />
        <div className="opx-pgrid2">
          <TextInput label={tn("region")} value={f.region} onChange={set("region")} />
          <SelectInput label={tn("urgency")} value={f.urgency} onChange={set("urgency")} options={withCur(URGENCIES, f.urgency).map((u) => ({ value: u, label: tn.has(`urg.${u}`) ? tn(`urg.${u}`) : u }))} />
          <SelectInput label={t("score")} value={f.score} onChange={set("score")} options={[...(f.score && !meta.scores.includes(f.score) ? [f.score] : []), ...(f.score ? [] : [""]), ...meta.scores].map((s) => ({ value: s, label: s ? (tsc.has(s) ? tsc(s) : s) : "—" }))} />
          <SelectInput label={tn("language")} value={f.language} onChange={set("language")} options={[...(f.language ? [] : [""]), ...withCur(meta.languages, f.language)].map((l) => ({ value: l, label: l ? (tl.has(l) ? tl(l) : l) : "—" }))} />
        </div>
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={t("cancel")} primary={() => void ok()} primaryLabel={t("save")} busy={busy} disabled={!f.title.trim()} />
    </Sheet>
  );
}

export function AssignSheet({ lead, mode, write, onClose }: Base & { mode: "assign" | "transfer" }) {
  const t = useTranslations("crm.sheet");
  const [ops, setOps] = useState<CrmOperator[] | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(
      () =>
        listCrmOperators(q, ctl.signal).then(setOps, (e) => {
          if (!isAborted(e)) logApiError("crm.operators", e);
        }),
      200,
    );
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [q]);
  const need = mode === "transfer";
  const errs = { pick: !pick ? t("pickOperator") : "", reason: need && reason.trim().length < 3 ? t("transferReason") : "" };
  const ok = async () => {
    setTried(true);
    if (errs.pick || errs.reason || busy) return;
    setBusy(true);
    const done = await write((l) => (mode === "transfer" ? transferLead(l, pick, reason) : assignLead(l, pick, reason)), mode === "transfer" ? t("transferred") : t("assigned"));
    setBusy(false);
    if (done) onClose();
  };
  const list = (ops ?? []).filter((o) => o.id !== lead.operatorId);
  const title = mode === "transfer" ? t("transferTitle") : t("assignTitle");
  return (
    <Sheet label={title} head={<SheetHead icon={<IcUsers size={20} />} title={title} sub={lead.workId} />} onClose={onClose} dirty={!!reason}>
      <div className="opx-pscroll">
        <label className="opx-cd-search">
          <IcSearch size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("findOperator")} aria-label={t("findOperator")} autoFocus />
        </label>
        <div className="opx-cd-picklist" role="radiogroup" aria-label={t("operators")}>
          {ops === null ? (
            <>
              <Shim h={52} />
              <Shim h={52} />
            </>
          ) : list.length ? (
            list.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={pick === o.id} className="opx-cd-pick" onClick={() => setPick(o.id)}>
                <Avatar name={o.name} />
                <span>
                  <b>{o.name}</b>
                  <small>{t("activeN", { n: o.activeLeads })}</small>
                </span>
                {pick === o.id ? <IcCheck size={17} /> : null}
              </button>
            ))
          ) : (
            <p className="opx-cd-sub">{t("noOperators")}</p>
          )}
        </div>
        {tried && errs.pick ? (
          <p className="opx-ferr" role="alert">
            {errs.pick}
          </p>
        ) : null}
        <TextArea label={need ? t("reasonRequiredLabel") : t("reasonOptional")} value={reason} onChange={setReason} placeholder={t("handoverPh")} required={need} error={tried && errs.reason ? errs.reason : undefined} />
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={t("cancel")} primary={() => void ok()} primaryLabel={mode === "transfer" ? t("transfer") : t("assign")} busy={busy} />
    </Sheet>
  );
}

export function WatcherSheet({ lead, write, onClose }: Base) {
  const t = useTranslations("crm.sheet");
  const tp = useTranslations("admin.ccx.panel");
  const [ops, setOps] = useState<CrmOperator[] | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    const ctl = new AbortController();
    listCrmOperators("", ctl.signal).then(setOps, (e) => {
      if (!isAborted(e)) logApiError("crm.operators", e);
      setOps((cur) => cur ?? []);
    });
    return () => ctl.abort();
  }, []);
  const watching = new Set(lead.watchers.map((w) => w.id));
  const add = async (id: string) => {
    setBusy(id);
    await write(() => addLeadWatcher(lead.id, id), t("watcherAdded"));
    setBusy("");
  };
  const list = (ops ?? []).filter((o) => !watching.has(o.id));
  return (
    <Sheet label={t("watchersTitle")} head={<SheetHead icon={<IcUserPlus size={20} />} title={t("watchersTitle")} sub={lead.workId} />} onClose={onClose}>
      <div className="opx-pscroll">
        <div className="opx-cd-picklist">
          {ops === null ? (
            <>
              <Shim h={52} />
              <Shim h={52} />
            </>
          ) : list.length ? (
            list.map((o) => (
              <button key={o.id} type="button" className="opx-cd-pick" onClick={() => void add(o.id)} disabled={!!busy} aria-busy={busy === o.id || undefined}>
                <Avatar name={o.name} />
                <span>
                  <b>{o.name}</b>
                </span>
                <IcUserPlus size={17} />
              </button>
            ))
          ) : (
            <p className="opx-cd-sub">{t("noOperators")}</p>
          )}
        </div>
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={tp("close")} kbd={false} />
    </Sheet>
  );
}

export function DuplicateSheet({ lead, write, onClose, preset }: Base & { preset: "not_duplicate" | "duplicate" }) {
  const t = useTranslations("crm.dup");
  const tc = useTranslations("crm.sheet");
  const tsrc = useTranslations("crm.source");
  const ts = useStatusName();
  const regionName = useRegionName();
  const locale = useLocale();
  const [others, setOthers] = useState<CrmLead[] | null>(null);
  const [other, setOther] = useState<CrmLead | null>(null);
  const [decision, setDecision] = useState<"not_duplicate" | "duplicate">(preset);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const lonely = !lead.duplicateOfId && !lead.customerId;
  useEffect(() => {
    if (!lead.duplicateOfId && !lead.customerId) return;
    const ctl = new AbortController();
    const run = async () => {
      try {
        if (lead.duplicateOfId) {
          const o = await getCrmLead(lead.duplicateOfId, ctl.signal);
          setOther(o);
          setOthers([o]);
        } else {
          const c = await getCrmCustomer(lead.customerId, ctl.signal);
          const list = c.leads.filter((l) => l.id !== lead.id);
          setOthers(list);
          setOther(list[0] ?? null);
        }
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.dup", e);
        setOthers([]);
      }
    };
    void run();
    return () => ctl.abort();
  }, [lead.duplicateOfId, lead.customerId, lead.id]);
  const shown: CrmLead[] | null = lonely ? [] : others;
  const rows: [string, (l: CrmLead) => string][] = [
    ["title", (l) => l.title],
    ["region", (l) => regionName(l.region)],
    ["source", (l) => (l.source ? (tsrc.has(l.source) ? tsrc(l.source) : tsrc("other")) : "")],
    ["status", (l) => (l.status ? ts(l.status) : "")],
    ["created", (l) => (l.createdAt ? shortDateTime(l.createdAt, locale) : "")],
    ["problem", (l) => l.problem],
  ];
  const errs = { reason: reason.trim().length < 3 ? t("reasonRequired") : "", target: decision === "duplicate" && !other ? t("pickTarget") : "" };
  const ok = async () => {
    setTried(true);
    if (errs.reason || errs.target || busy) return;
    setBusy(true);
    const done = await write(() => resolveDuplicate(lead.id, decision, reason, other?.id ?? ""), decision === "duplicate" ? t("markedDup") : t("markedNot"));
    setBusy(false);
    if (done) onClose();
  };
  const side = (l: CrmLead, mark?: "keep" | "drop") => (
    <div className="opx-cd-cmp__side" data-mark={mark}>
      <b>{l.title || l.workId}</b>
      <span className="opx-cd-code opx-num">{l.workId}</span>
      <dl>
        {rows.map(([k, get]) => (
          <div key={k} data-diff={other && get(lead) !== get(other) ? "" : undefined}>
            <dt>{t(`f.${k}`)}</dt>
            <dd>{get(l) || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  return (
    <Sheet label={t("title")} head={<SheetHead icon={<IcLink size={20} />} title={t("title")} sub={t("lead")} />} onClose={onClose} dirty={!!reason} wide>
      <div className="opx-pscroll">
        {shown === null ? (
          <Shim h={180} />
        ) : (
          <>
            {shown.length > 1 ? <SelectInput label={t("compareWith")} value={other?.id ?? ""} onChange={(v) => setOther(shown.find((o) => o.id === v) ?? null)} options={shown.map((o) => ({ value: o.id, label: `${o.workId} · ${o.title}` }))} /> : null}
            <div className="opx-cd-cmp">
              {side(lead, decision === "duplicate" ? "drop" : undefined)}
              <IcArrowRight size={20} />
              {other ? side(other, decision === "duplicate" ? "keep" : undefined) : <Empty title={t("nothingToCompare")} />}
            </div>
          </>
        )}
        <Seg
          label={t("decision")}
          value={decision}
          onChange={setDecision}
          options={[
            { value: "not_duplicate", label: t("not") },
            { value: "duplicate", label: t("is"), disabled: !other },
          ]}
        />
        <TextArea label={t("reason")} value={reason} onChange={setReason} rows={3} required error={tried && (errs.reason || errs.target) ? errs.reason || errs.target : undefined} hint={t("safe")} />
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={tc("cancel")} primary={() => void ok()} primaryLabel={t("decide")} busy={busy} />
    </Sheet>
  );
}

export function ConflictSheet({ mine, fresh, onClose }: { mine: CrmLead; fresh: CrmLead | null; onClose: () => void }) {
  const t = useTranslations("crm.lead");
  const ts = useStatusName();
  const regionName = useRegionName();
  const locale = useLocale();
  const when = (v: string) => (v ? shortDateTime(v, locale) : t("none"));
  const urg = (v: string) => (v && t.has(`urg.${v}`) ? t(`urg.${v}`) : "");
  const rows = fresh
    ? ([
        [t("cf.status"), ts(mine.status), ts(fresh.status)],
        [t("cf.operator"), mine.operator?.name || t("none"), fresh.operator?.name || t("none")],
        [t("cf.next"), when(mine.nextActionAt), when(fresh.nextActionAt)],
        [t("cf.title"), mine.title, fresh.title],
        [t("cf.urgency"), urg(mine.urgency), urg(fresh.urgency)],
        [t("cf.region"), regionName(mine.region), regionName(fresh.region)],
      ] as [string, string, string][]).filter(([, a, b]) => a !== b)
    : [];
  return (
    <Sheet label={t("conflict")} head={<SheetHead icon={<IcRefresh size={20} />} title={t("conflict")} sub={t("conflictText")} />} onClose={onClose}>
      <div className="opx-pscroll">
        {rows.length ? (
          <ul className="opx-cd-diff">
            {rows.map(([k, a, b]) => (
              <li key={k}>
                <small>{k}</small>
                <del>{a || t("none")}</del>
                <IcArrowRight size={16} />
                <ins>{b || t("none")}</ins>
              </li>
            ))}
          </ul>
        ) : (
          <Note tone="info">{t("conflictSame")}</Note>
        )}
      </div>
      <PanelFoot primary={onClose} primaryLabel={t("gotIt")} kbd={false} />
    </Sheet>
  );
}
