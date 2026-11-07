"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import {
  addCrmContact,
  createCrmCustomer,
  createCrmLead,
  crmField,
  getCrmCustomer,
  listCrmCustomers,
  mergeCrmCustomers,
  updateCrmCustomer,
  type ContactInput,
  type CrmCustomer,
  type CrmCustomerDetail,
  type CrmMeta,
} from "@/lib/services/crm";
import Sheet from "../../panel/Sheet";
import { prettyPhone } from "../../now/feed";
import { Note, PanelFoot } from "../../panel/bits";
import { IcArrowRight, IcSearch, IcUser } from "../../icons";
import { leadHref } from "../nav";
import { IcEdit, IcLink, IcPlus } from "./glyphs";
import { Avatar, Check, DateTimeInput, Seg, SelectInput, SheetHead, TextArea, TextInput, type Opt } from "./kit";
import { useCrmErr, useRegionName } from "../leads/util";

function useLangOpts(meta: CrmMeta, cur: string): Opt[] {
  const tl = useTranslations("admin.ccx.crm.lang");
  return [...(cur && !meta.languages.includes(cur) ? [cur] : []), ...meta.languages].map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }));
}

export function EditCustomerSheet({ c, meta, onClose, onSaved }: { c: CrmCustomerDetail; meta: CrmMeta; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("crm.customer");
  const tn = useTranslations("crm.newCustomer");
  const crmErr = useCrmErr();
  const regionName = useRegionName();
  const shownRegion = regionName(c.region);
  const [f, setF] = useState({ name: c.name, region: shownRegion, language: c.language, notes: c.notes });
  const langs = useLangOpts(meta, f.language);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const save = async () => {
    setTried(true);
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try {
      await updateCrmCustomer(c.id, { name: f.name, region: c.region && f.region.trim() === shownRegion ? c.region : f.region, language: f.language, notes: f.notes });
      toast(t("saved"), { tone: "ok" });
      onSaved();
      onClose();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet label={t("edit")} head={<SheetHead icon={<IcEdit size={20} />} title={t("edit")} sub={c.publicId} />} onClose={onClose} dirty>
      <div className="opx-pscroll">
        <TextInput label={tn("name")} value={f.name} onChange={(v) => setF({ ...f, name: v })} required autoFocus error={tried && !f.name.trim() ? tn("nameRequired") : undefined} />
        <div className="opx-pgrid2">
          <TextInput label={tn("region")} value={f.region} onChange={(v) => setF({ ...f, region: v })} />
          <SelectInput label={tn("language")} value={f.language} onChange={(v) => setF({ ...f, language: v })} options={langs} />
        </div>
        <TextArea label={tn("notes")} value={f.notes} onChange={(v) => setF({ ...f, notes: v })} rows={5} />
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={tn("cancel")} primary={() => void save()} primaryLabel={t("save")} busy={busy} disabled={!f.name.trim()} />
    </Sheet>
  );
}

export function AddContactSheet({ c, meta, onClose, onSaved }: { c: CrmCustomerDetail; meta: CrmMeta; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("crm.customer");
  const tc = useTranslations("crm.contact");
  const tx = useTranslations("admin.ccx.crmDetail");
  const crmErr = useCrmErr();
  const [type, setType] = useState(meta.contactTypes[0] || "phone");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [primary, setPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await addCrmContact(c.id, { type, value, label, primary });
      toast(t("contactAdded"), { tone: "ok" });
      onSaved();
      onClose();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const types = meta.contactTypes.length ? meta.contactTypes : ["phone"];
  return (
    <Sheet label={tx("addContactTitle")} head={<SheetHead icon={<IcPlus size={20} />} title={tx("addContactTitle")} sub={c.name || c.publicId} />} onClose={onClose} dirty={!!value || !!label}>
      <div className="opx-pscroll">
        <Seg label={tc("type")} value={type} onChange={setType} options={types.map((k) => ({ value: k, label: tc.has(`t.${k}`) ? tc(`t.${k}`) : k }))} />
        <div className="opx-pgrid2">
          <TextInput label={tc("value")} value={value} onChange={setValue} autoFocus required inputMode={type === "phone" ? "tel" : type === "email" ? "email" : "text"} placeholder={type === "phone" ? "+998" : type === "telegram" ? "@" : undefined} />
          <TextInput label={tc("label")} value={label} onChange={setLabel} />
        </div>
        <Check checked={primary} onChange={setPrimary}>
          {tc("makePrimary")}
        </Check>
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={t("cancel")} primary={() => void save()} primaryLabel={t("save")} busy={busy} disabled={!value.trim()} />
    </Sheet>
  );
}

export function MergeSheet({ target, onClose, onMerged }: { target: CrmCustomerDetail; onClose: () => void; onMerged: () => void }) {
  const t = useTranslations("crm.merge");
  const crmErr = useCrmErr();
  const regionName = useRegionName();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<CrmCustomer[]>([]);
  const [source, setSource] = useState<CrmCustomerDetail | null>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const word = t("confirmWord");
  const needle = q.trim();
  useEffect(() => {
    if (needle.length < 2) return;
    const ctl = new AbortController();
    const id = window.setTimeout(
      () =>
        listCrmCustomers({ q: needle, limit: 8, status: "" }, ctl.signal).then(
          (p) => setFound(p.items.filter((x) => x.id !== target.id)),
          (e) => {
            if (!isAborted(e)) logApiError("crm.merge.search", e);
          },
        ),
      220,
    );
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [needle, target.id]);
  const pick = async (id: string) => {
    try {
      setSource(await getCrmCustomer(id));
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    }
  };
  const ready = !!source && reason.trim().length >= 3 && typed.trim().toLowerCase() === word.toLowerCase();
  const merge = async () => {
    if (!ready || !source || busy) return;
    setBusy(true);
    try {
      await mergeCrmCustomers(target.id, [source.id], reason);
      toast(t("done"), { tone: "ok" });
      onMerged();
      onClose();
      router.refresh();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const fields = (x: CrmCustomerDetail): [string, string][] => [
    [t("f.id"), x.publicId],
    [t("f.phone"), x.phone ? prettyPhone(x.phone) : ""],
    [t("f.telegram"), x.telegram],
    [t("f.email"), x.email],
    [t("f.region"), regionName(x.region)],
    [t("f.account"), x.isLexgoUser ? t("yes") : t("no")],
    [t("f.leads"), String(x.leadCount)],
  ];
  const shownFound = needle.length < 2 ? [] : found;
  return (
    <Sheet label={t("title")} head={<SheetHead icon={<IcLink size={20} />} title={t("title")} sub={t("lead")} />} onClose={onClose} dirty={!!reason} wide>
      <div className="opx-pscroll">
        {!source ? (
          <>
            <label className="opx-cd-search">
              <IcSearch size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("find")} aria-label={t("find")} autoFocus />
            </label>
            {shownFound.length ? (
              <div className="opx-cd-picklist">
                {shownFound.map((x) => (
                  <button key={x.id} type="button" className="opx-cd-pick" onClick={() => void pick(x.id)}>
                    <Avatar name={x.name} />
                    <span>
                      <b>{x.name || x.publicId}</b>
                      <small className="opx-num">{[x.publicId, x.phone ? prettyPhone(x.phone) : "", regionName(x.region)].filter(Boolean).join(" · ")}</small>
                    </span>
                    <IcArrowRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="opx-cd-sub">{t("findHint")}</p>
            )}
          </>
        ) : (
          <>
            <div className="opx-cd-cmp">
              <div className="opx-cd-cmp__side" data-mark="drop">
                <b>{source.name}</b>
                <small className="opx-cd-mute">{t("goes")}</small>
                <dl>
                  {fields(source).map(([k, v], i) => (
                    <div key={k} data-diff={v !== fields(target)[i][1] ? "" : undefined}>
                      <dt>{k}</dt>
                      <dd>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <IcArrowRight size={20} />
              <div className="opx-cd-cmp__side" data-mark="keep">
                <b>{target.name}</b>
                <small className="opx-cd-mute">{t("stays")}</small>
                <dl>
                  {fields(target).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <Note tone="bad">
              <b>{t("moves", { leads: source.leads.length, contacts: source.contacts.length })}</b>
              {source.leads.map((l) => l.workId || l.title).join(", ") || t("noLeads")}
              {source.contacts.length ? ` · ${source.contacts.map((x) => x.value).join(", ")}` : ""}
            </Note>
            <button type="button" className="opx-pbtn opx-pbtn--ghost opx-cd-self-start" onClick={() => setSource(null)}>
              {t("change")}
            </button>
            <TextArea label={t("reason")} value={reason} onChange={setReason} rows={3} required />
            <TextInput label={t("type", { word })} value={typed} onChange={setTyped} required />
          </>
        )}
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={t("cancel")} primary={() => void merge()} primaryLabel={t("confirm")} busy={busy} disabled={!ready} danger kbd={false} />
    </Sheet>
  );
}

export function NewCustomerSheet({ meta, onClose, onCreated }: { meta: CrmMeta; onClose: () => void; onCreated: (c: CrmCustomerDetail) => void }) {
  const t = useTranslations("crm.newCustomer");
  const crmErr = useCrmErr();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState(meta.languages[0] || "uz_latn");
  const langs = useLangOpts(meta, language);
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const nameErr = tried && !name.trim() ? t("nameRequired") : "";
  const submit = async () => {
    setTried(true);
    if (!name.trim() || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    const contacts: ContactInput[] = [
      { type: "phone", value: phone, primary: true },
      { type: "telegram", value: telegram, primary: !phone.trim() },
      { type: "email", value: email, primary: !phone.trim() && !telegram.trim() },
    ].filter((c) => c.value.trim());
    try {
      const c = await createCrmCustomer({ name, region, language, notes, contacts, source: "manual" });
      toast(c.reused ? t("doneExisting", { id: c.publicId }) : t("done", { id: c.publicId }), { tone: "ok" });
      onCreated(c);
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet label={t("title")} head={<SheetHead icon={<IcUser size={20} />} title={t("title")} />} onClose={onClose} dirty={!!(name || phone || telegram || email || notes)}>
      <div className="opx-pscroll">
        <TextInput label={t("name")} value={name} onChange={setName} required autoFocus error={nameErr || undefined} />
        <div className="opx-pgrid2">
          <TextInput label={t("phone")} value={phone} onChange={setPhone} type="tel" inputMode="tel" placeholder="+998" />
          <TextInput label={t("telegram")} value={telegram} onChange={setTelegram} placeholder="@" />
          <TextInput label={t("email")} value={email} onChange={setEmail} type="email" inputMode="email" />
          <TextInput label={t("region")} value={region} onChange={setRegion} />
        </div>
        <SelectInput label={t("language")} value={language} onChange={setLanguage} options={langs} />
        <TextArea label={t("notes")} value={notes} onChange={setNotes} rows={4} />
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={t("cancel")} primary={() => void submit()} primaryLabel={t("create")} busy={busy} />
    </Sheet>
  );
}

export function NewLeadSheet({ meta, customer, onClose }: { meta: CrmMeta; customer: CrmCustomerDetail; onClose: () => void }) {
  const t = useTranslations("crm.newLead");
  const tsrc = useTranslations("crm.source");
  const crmErr = useCrmErr();
  const regionName = useRegionName();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [region, setRegion] = useState(() => regionName(customer.region));
  const [urgency, setUrgency] = useState("normal");
  const [source, setSource] = useState(meta.sources.includes("phone") ? "phone" : meta.sources[0] || "manual");
  const [language, setLanguage] = useState(meta.languages[0] || "uz_latn");
  const langs = useLangOpts(meta, language);
  const [next, setNext] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dupWarn, setDupWarn] = useState(false);
  const [serverField, setServerField] = useState("");
  const reqRef = useRef(0);
  const errs = { who: serverField === "customer_id" ? t("pickCustomer") : "", title: !title.trim() || serverField === "title" ? t("titleRequired") : "" };
  const submit = async (force = false) => {
    setTried(true);
    setServerField("");
    if (!title.trim() || busy) return;
    setBusy(true);
    const n = ++reqRef.current;
    try {
      const lead = await createCrmLead({ customerId: customer.id, title, problem, region: customer.region && region.trim() === regionName(customer.region) ? customer.region : region, urgency, source, language, nextActionAt: next ? new Date(next).toISOString() : "", forceCreate: force });
      if (n !== reqRef.current) return;
      const reopened = lead.cycleNumber > 1 && !force;
      toast(reopened ? t("doneReopened", { n: lead.cycleNumber }) : lead.duplicateStatus === "needs_review" ? t("doneDup") : t("done"), { tone: reopened || lead.duplicateStatus === "needs_review" ? "info" : "ok" });
      onClose();
      router.push(leadHref(lead.id));
    } catch (e) {
      if (/duplicate/.test(String((e as { code?: string })?.code ?? ""))) setDupWarn(true);
      setServerField(crmField(e));
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const show = (k: keyof typeof errs) => (tried ? errs[k] : "");
  return (
    <Sheet label={t("title")} head={<SheetHead icon={<IcPlus size={20} />} title={t("title")} sub={customer.name || customer.publicId} />} onClose={onClose} dirty={!!(title || problem)}>
      <div className="opx-pscroll">
        <div className="opx-cd-fixedwho" data-err={show("who") ? "" : undefined}>
          <Avatar name={customer.name} />
          <span>
            <small>{t("customer")}</small>
            <b>{customer.name || customer.publicId}</b>
            <small className="opx-num">{[customer.publicId, customer.phone].filter(Boolean).join(" · ")}</small>
          </span>
        </div>
        {show("who") ? <Note tone="bad">{show("who")}</Note> : null}
        <TextInput label={t("titleLabel")} value={title} onChange={setTitle} required autoFocus error={show("title") || undefined} />
        <TextArea label={t("problem")} value={problem} onChange={setProblem} rows={4} />
        <div className="opx-pgrid2">
          <TextInput
            label={t("region")}
            value={region}
            onChange={setRegion}
          />
          <SelectInput label={t("source")} value={source} onChange={setSource} options={(meta.sources.includes(source) ? meta.sources : [source, ...meta.sources]).map((s) => ({ value: s, label: tsrc.has(s) ? tsrc(s) : tsrc("other") }))} />
          <SelectInput label={t("urgency")} value={urgency} onChange={setUrgency} options={["low", "normal", "high", "urgent"].map((u) => ({ value: u, label: t(`urg.${u}`) }))} />
          <SelectInput label={t("language")} value={language} onChange={setLanguage} options={langs} />
        </div>
        <DateTimeInput label={t("next")} value={next} onChange={setNext} />
        {dupWarn ? <Note tone="warn">{t("dupText")}</Note> : null}
      </div>
      <PanelFoot
        onCancel={onClose}
        cancelLabel={t("cancel")}
        primary={() => void submit(false)}
        primaryLabel={t("create")}
        busy={busy}
        disabled={!title.trim()}
        extra={
          dupWarn ? (
            <button type="button" className="opx-pbtn" onClick={() => void submit(true)} disabled={busy}>
              {t("forceCreate")}
            </button>
          ) : null
        }
      />
    </Sheet>
  );
}
