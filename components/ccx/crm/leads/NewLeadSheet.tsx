"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { createCrmCustomer, createCrmLead, crmCan, crmField, optionOfCustomer, selectCrmCustomers, type ContactInput, type CrmMeta, type CustomerOption } from "@/lib/services/crm";
import Sheet from "../../panel/Sheet";
import { Choice, Field, Note, PanelFoot } from "../../panel/bits";
import { prettyPhone } from "../../now/feed";
import { initials } from "@/lib/lawyers";
import { IcArrowLeft, IcCheck, IcRefresh, IcSearch, IcUser } from "../../icons";
import { leadHref } from "../nav";
import { IcPlus } from "./icons";
import { DateTimeField, SelectField, TextField } from "./fields";
import { useCrmErr, useRegionName } from "./util";

const URGENCIES = ["low", "normal", "high", "urgent"];

export function NewLeadButton({ meta, quiet = false }: { meta: CrmMeta; quiet?: boolean }) {
  const t = useTranslations("crm.newLead");
  const [open, setOpen] = useState(false);
  if (!crmCan(meta, "crm.leads.manage")) return null;
  return (
    <>
      <button type="button" className={`opx-pbtn${quiet ? "" : " opx-pbtn--main"} opx-ld-newbtn`} onClick={() => setOpen(true)}>
        <IcPlus size={18} />
        {t("title")}
      </button>
      {open ? <NewLeadSheet meta={meta} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NewLeadSheet({ meta, onClose }: { meta: CrmMeta; onClose: () => void }) {
  const t = useTranslations("crm.newLead");
  const tc = useTranslations("crm.newCustomer");
  const tl = useTranslations("admin.ccx.crm.lang");
  const tsrc = useTranslations("crm.source");
  const tp = useTranslations("crm.picker");
  const tx = useTranslations("admin.ccx.crmLeads");
  const regionName = useRegionName();
  const crmErr = useCrmErr();
  const router = useRouter();
  const [step, setStep] = useState<"lead" | "customer">("lead");
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [region, setRegion] = useState("");
  const [regionTouched, setRegionTouched] = useState(false);
  const [urgency, setUrgency] = useState("normal");
  const [source, setSource] = useState(meta.sources.includes("phone") ? "phone" : meta.sources[0] || "manual");
  const [language, setLanguage] = useState(meta.languages[0] || "uz_latn");
  const [next, setNext] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dupWarn, setDupWarn] = useState(false);
  const [serverField, setServerField] = useState("");
  const [err, setErr] = useState("");
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cTelegram, setCTelegram] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRegion, setCRegion] = useState("");
  const [cLanguage, setCLanguage] = useState(meta.languages[0] || "uz_latn");
  const [cNotes, setCNotes] = useState("");
  const [cTried, setCTried] = useState(false);
  const [cBusy, setCBusy] = useState(false);
  const [cErr, setCErr] = useState("");
  const reqRef = useRef(0);
  const sending = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const langs = meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }));
  const errs = { who: !customer || serverField === "customer_id" ? t("pickCustomer") : "", title: !title.trim() || serverField === "title" ? t("titleRequired") : "" };
  const show = (k: keyof typeof errs) => (tried ? errs[k] : "");
  const dirty = !!(title || problem || customer || cName || cPhone || cTelegram || cEmail || cNotes);

  const pickCustomer = (c: CustomerOption | null) => {
    setCustomer(c);
    if (c && !regionTouched) setRegion(regionName(c.region));
  };

  const submit = async (force = false) => {
    setTried(true);
    setServerField("");
    setErr("");
    if (!customer || !title.trim() || busy) {
      if (customer && !title.trim()) titleRef.current?.focus();
      return;
    }
    setBusy(true);
    const n = ++reqRef.current;
    try {
      const lead = await createCrmLead({
        customerId: customer.id,
        title,
        problem,
        region: customer.region && region.trim() === regionName(customer.region) ? customer.region : region,
        urgency,
        source,
        language,
        nextActionAt: next ? new Date(next).toISOString() : "",
        forceCreate: force,
      });
      if (n !== reqRef.current) return;
      const reopened = lead.cycleNumber > 1 && !force;
      toast(reopened ? t("doneReopened", { n: lead.cycleNumber }) : lead.duplicateStatus === "needs_review" ? t("doneDup") : t("done"), { tone: reopened || lead.duplicateStatus === "needs_review" ? "info" : "ok" });
      onClose();
      router.push(leadHref(lead.id));
    } catch (e) {
      if (/duplicate/.test(String((e as { code?: string })?.code ?? ""))) setDupWarn(true);
      setServerField(crmField(e));
      setErr(crmErr(e));
    } finally {
      setBusy(false);
    }
  };

  const createCustomer = async () => {
    setCTried(true);
    setCErr("");
    if (!cName.trim() || cBusy || sending.current) return;
    sending.current = true;
    setCBusy(true);
    const contacts: ContactInput[] = [
      { type: "phone", value: cPhone, primary: true },
      { type: "telegram", value: cTelegram, primary: !cPhone.trim() },
      { type: "email", value: cEmail, primary: !cPhone.trim() && !cTelegram.trim() },
    ].filter((c) => c.value.trim());
    try {
      const c = await createCrmCustomer({ name: cName, region: cRegion, language: cLanguage, notes: cNotes, contacts, source: "manual" });
      toast(c.reused ? tc("doneExisting", { id: c.publicId }) : tc("done", { id: c.publicId }), { tone: "ok" });
      pickCustomer(optionOfCustomer(c));
      if (!regionTouched) setRegion(regionName(c.region));
      setCName("");
      setCPhone("");
      setCTelegram("");
      setCEmail("");
      setCRegion("");
      setCNotes("");
      setCTried(false);
      setStep("lead");
    } catch (e) {
      setCErr(crmErr(e));
    } finally {
      sending.current = false;
      setCBusy(false);
    }
  };

  const head =
    step === "lead" ? (
      <div className="opx-ld-shead">
        <span className="opx-ld-shead__ic" aria-hidden="true">
          <IcPlus size={20} />
        </span>
        <span className="opx-ld-shead__txt">
          <b>{t("title")}</b>
        </span>
      </div>
    ) : (
      <div className="opx-ld-shead">
        <button type="button" className="opx-ld-back" onClick={() => setStep("lead")} aria-label={tx("back")} title={tx("back")}>
          <IcArrowLeft size={18} />
        </button>
        <span className="opx-ld-shead__txt">
          <b>{tc("title")}</b>
        </span>
      </div>
    );

  return (
    <Sheet label={step === "lead" ? t("title") : tc("title")} head={head} onClose={onClose} dirty={dirty} className="opx-nl">
      {step === "lead" ? (
        <>
          <div className="opx-pscroll opx-ld-form">
            <div className="opx-ld-f">
              <span className="opx-ld-f__label">
                {t("customer")}
                <i aria-hidden="true">*</i>
              </span>
              {customer ? (
                <div className="opx-ld-cust">
                  <span className="opx-ld-cust__ic" aria-hidden="true">
                    <Initials name={customer.name} size={20} />
                    <i className="opx-ld-cust__ok">
                      <IcCheck size={11} />
                    </i>
                  </span>
                  <span className="opx-ld-cust__txt">
                    <b>{customer.name || customer.label}</b>
                    <small className="opx-num">{[customer.publicId, customer.phone ? prettyPhone(customer.phone) : "", regionName(customer.region)].filter(Boolean).join(" · ")}</small>
                  </span>
                  {customer.isLexgoUser ? <em className="opx-pill" data-tone="info">{tp("lexgoUser")}</em> : null}
                  <button type="button" className="opx-pbtn opx-pbtn--ghost" onClick={() => setCustomer(null)}>
                    {t("change")}
                  </button>
                </div>
              ) : (
                <CustomerPick invalid={!!show("who")} onPick={pickCustomer} onNew={crmCan(meta, "crm.customers.manage") ? () => setStep("customer") : undefined} />
              )}
              {show("who") ? (
                <p className="opx-ferr" role="alert">
                  {show("who")}
                </p>
              ) : null}
            </div>
            <TextField inputRef={titleRef} label={t("titleLabel")} value={title} onChange={setTitle} required error={show("title") || undefined} placeholder={t("ph.title")} />
            <Field label={t("problem")} value={problem} onChange={setProblem} multiline rows={4} placeholder={t("ph.problem")} />
            <div className="opx-pgrid2">
              <TextField
                label={t("region")}
                value={region}
                placeholder={t("ph.region")}
                onChange={(v) => {
                  setRegion(v);
                  setRegionTouched(true);
                }}
              />
              <SelectField label={t("source")} value={source} onChange={setSource} options={meta.sources.map((s) => ({ value: s, label: tsrc.has(s) ? tsrc(s) : tsrc("other") }))} />
            </div>
            <Choice label={t("urgency")} value={urgency} onChange={setUrgency} options={URGENCIES.map((u) => ({ value: u, label: t(`urg.${u}`), danger: u === "urgent" }))} />
            <div className="opx-pgrid2">
              <SelectField label={t("language")} value={language} onChange={setLanguage} options={langs} />
              <DateTimeField label={t("next")} value={next} onChange={setNext} />
            </div>
            {dupWarn ? <Note tone="warn">{t("dupText")}</Note> : null}
            {err ? <Note tone="bad">{err}</Note> : null}
          </div>
          <PanelFoot
            onCancel={onClose}
            cancelLabel={t("cancel")}
            primary={() => void submit(false)}
            primaryLabel={t("create")}
            busy={busy}
            extra={
              dupWarn ? (
                <button type="button" className="opx-pbtn" onClick={() => void submit(true)} disabled={busy}>
                  {t("forceCreate")}
                </button>
              ) : null
            }
          />
        </>
      ) : (
        <>
          <div className="opx-pscroll opx-ld-form">
            <TextField label={tc("name")} value={cName} onChange={setCName} placeholder={tc("ph.name")} required autoFocus error={cTried && !cName.trim() ? tc("nameRequired") : undefined} />
            <div className="opx-pgrid2">
              <TextField type="tel" inputMode="tel" label={tc("phone")} value={cPhone} onChange={setCPhone} placeholder={tc("ph.phone")} />
              <TextField label={tc("telegram")} value={cTelegram} onChange={setCTelegram} placeholder={tc("ph.telegram")} />
            </div>
            <div className="opx-pgrid2">
              <TextField type="email" inputMode="email" label={tc("email")} value={cEmail} onChange={setCEmail} placeholder={tc("ph.email")} />
              <TextField label={tc("region")} value={cRegion} onChange={setCRegion} placeholder={tc("ph.region")} />
            </div>
            <SelectField label={tc("language")} value={cLanguage} onChange={setCLanguage} options={langs} />
            <Field label={tc("notes")} value={cNotes} onChange={setCNotes} multiline rows={3} placeholder={tc("ph.notes")} />
            {cErr ? <Note tone="bad">{cErr}</Note> : null}
          </div>
          <PanelFoot onCancel={() => setStep("lead")} cancelLabel={tx("back")} primary={() => void createCustomer()} primaryLabel={tc("createAndPick")} busy={cBusy} />
        </>
      )}
    </Sheet>
  );
}

// A person's initials in a tinted circle; the generic icon only without a name.
function Initials({ name, size }: { name: string; size: number }) {
  const ab = initials(name.trim().replace(/\s+/g, " "));
  return ab ? <b className="opx-ld-ini">{ab}</b> : <IcUser size={size} />;
}

type PickState = "loading" | "idle" | "more" | "failed";

// onNew: only when the session may create customers (crm.customers.manage).
function CustomerPick({ invalid, onPick, onNew }: { invalid: boolean; onPick: (c: CustomerOption) => void; onNew?: () => void }) {
  const t = useTranslations("crm.picker");
  const tx = useTranslations("admin.ccx.crmLeads");
  const regionName = useRegionName();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CustomerOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<PickState>("loading");
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);
  const more = useRef<AbortController | null>(null);

  useEffect(() => {
    const c = new AbortController();
    const id = window.setTimeout(
      () => {
        more.current?.abort();
        setState("loading");
        selectCrmCustomers({ q: q.trim(), offset: 0 }, c.signal).then(
          (r) => {
            setItems(r.items);
            setHasMore(r.hasMore);
            setActive(0);
            setState("idle");
          },
          (e) => {
            if (isAborted(e)) return;
            logApiError("crm.lookup", e);
            setState("failed");
          },
        );
      },
      q ? 300 : 0,
    );
    return () => {
      c.abort();
      window.clearTimeout(id);
    };
  }, [q, tick]);

  const loadMore = async () => {
    if (!hasMore || state !== "idle") return;
    more.current?.abort();
    const c = new AbortController();
    more.current = c;
    setState("more");
    try {
      const r = await selectCrmCustomers({ q: q.trim(), offset: items.length }, c.signal);
      if (c.signal.aborted) return;
      setItems((cur) => [...cur, ...r.items.filter((x) => !cur.some((y) => y.id === x.id))]);
      setHasMore(r.hasMore);
      setState("idle");
    } catch (e) {
      if (isAborted(e)) return;
      logApiError("crm.lookup", e);
      setState("failed");
    }
  };

  const listId = `${uid}-list`;
  const optId = (c: CustomerOption) => `${uid}-o-${c.id}`;

  return (
    <div className="opx-ld-pick" data-invalid={invalid || undefined}>
      <label className="opx-search opx-ld-pick__search">
        <IcSearch size={18} />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              onPick(items[active]);
            }
          }}
          placeholder={t("searchPh")}
          aria-label={t("search")}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={items[active] ? optId(items[active]) : undefined}
          aria-invalid={invalid || undefined}
        />
        {state === "loading" && q ? <span className="opx-ld-spin" aria-label={t("searching")} /> : null}
      </label>
      <div
        className="opx-ld-pick__list"
        id={listId}
        role="listbox"
        aria-label={t("search")}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 48) void loadMore();
        }}
      >
        {state === "loading" && !items.length ? (
          [0, 1, 2].map((i) => <i key={i} className="opx-shim opx-ld-pick__shim" />)
        ) : state === "failed" ? (
          <p className="opx-ld-pick__empty">
            {t("failed")}
            <button type="button" className="opx-pbtn opx-pbtn--ghost" onClick={() => setTick((n) => n + 1)}>
              <IcRefresh size={15} />
              {t("retry")}
            </button>
          </p>
        ) : !items.length ? (
          <p className="opx-ld-pick__empty">{t("empty")}</p>
        ) : (
          items.map((c, i) => (
            <button key={c.id} id={optId(c)} type="button" role="option" aria-selected={i === active} className={`opx-ld-opt${i === active ? " is-on" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => onPick(c)}>
              <span className="opx-ld-opt__av" aria-hidden="true">
                <Initials name={c.name} size={16} />
              </span>
              <span className="opx-ld-opt__txt">
                {c.name ? (
                  <span className="opx-ld-opt__top">
                    <b>{c.name}</b>
                    {c.publicId ? <em className="opx-ld-opt__id opx-num">{c.publicId}</em> : null}
                    {c.phone ? <span className="opx-ld-opt__tel opx-num">{prettyPhone(c.phone)}</span> : null}
                  </span>
                ) : (
                  <b>{c.label}</b>
                )}
                <small>{[regionName(c.region), t("leadsN", { n: c.leadCount })].filter(Boolean).join(" · ")}</small>
              </span>
              {c.isLexgoUser ? <em className="opx-pill" data-tone="info">{t("lexgoUser")}</em> : null}
              <span className="opx-ld-opt__ok" aria-hidden="true">
                <IcCheck size={14} />
              </span>
            </button>
          ))
        )}
        {state === "more" ? <p className="opx-ld-pick__empty">{t("loadingMore")}</p> : null}
        {hasMore && state === "idle" ? (
          <button type="button" className="opx-ld-pick__more" onClick={() => void loadMore()}>
            {tx("showMore")}
          </button>
        ) : null}
      </div>
      {onNew ? (
        <button type="button" className="opx-ld-pick__new" onClick={onNew}>
          <IcPlus size={16} />
          {t("newCustomer")}
        </button>
      ) : null}
    </div>
  );
}
