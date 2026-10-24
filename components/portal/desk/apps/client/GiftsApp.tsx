"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createGift, getAllServices, getSubscriptionPlans, listGifts, type BackendPlan, type BackendService, type GiftResult } from "@/lib/services/backend";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { dateOnly } from "@/lib/date";
import { IconArrowRight, IconCheck, IconCopy, IconGift, IconInbox, IconPlus, IconSend } from "@/components/icons";
import { App, Banner, Btn, Dialog, Empty, Field, Input, Loading, Seg, Select, Sidebar, Table, Tag, Tool, Toolbar, useOs, useToast, type Col, type NavSection, type Tone } from "../../kit/kit";
import "./client.css";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

// Gifts as a desktop program — what the client gave and what they got, in
// a list (Finder's list / Explorer's details), and "Give a gift": a LexGo
// plan for some months or one service, with an estimate; made, it gives
// the link and the QR to send on, and the payment opens in a new tab. The
// rules are the web page's.

type Gift = Awaited<ReturnType<typeof listGifts>>[number];
type View = "all" | "sent" | "received";
const TERMS = [3, 6, 12];

function toneOf(status: string): Tone {
  if (status === "claimed" || status === "activated") return "ok";
  if (status === "pending" || status === "unpaid") return "warn";
  if (status === "expired" || status === "canceled" || status === "cancelled") return "neutral";
  return "info";
}
function estimate(plan: BackendPlan, months: number) {
  if (months === 12 && plan.yearlyPrice) return plan.yearlyPrice;
  if (months === 6 && plan.sixMonthPrice) return plan.sixMonthPrice;
  return plan.monthlyPrice * months;
}

export default function GiftsApp() {
  const t = useTranslations("portal.client.gifts");
  const tg = useTranslations("portal.client.gifts.statusMap");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const os = useOs();
  const [gifts, setGifts] = useState<Gift[] | null>(null);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<View>("all");
  const [sel, setSel] = useState("");
  const [giving, setGiving] = useState(false);
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    listGifts()
      .then((l) => alive && setGifts(l))
      .catch(() => alive && setGifts([]));
    return () => {
      alive = false;
    };
  }, [tick]);

  const all = gifts ?? [];
  const rows = all.filter((g) => view === "all" || (view === "received") === (g.direction === "received"));
  const cur = rows.find((g) => g.id === sel) ?? null;
  const sections: NavSection[] = [
    {
      id: "g",
      title: os === "mac" ? t("title") : undefined,
      items: [
        { id: "all", label: t("title"), icon: <IconGift />, count: all.length || undefined },
        { id: "sent", label: t("send"), icon: <IconSend />, count: all.filter((g) => g.direction !== "received").length || undefined },
        { id: "received", label: t("gotIt"), icon: <IconInbox />, count: all.filter((g) => g.direction === "received").length || undefined },
      ],
    },
  ];
  const cols: Col<Gift>[] = [
    {
      id: "name",
      label: t("title"),
      cell: (g) => (
        <span className="dxcw-name">
          <span className={`dxcw-ic is-${toneOf(g.status)}`} aria-hidden>
            <IconGift />
          </span>
          <span>
            <b>{g.title || t("untitledGift")}</b>
            <small>
              {g.workId ? <code>{g.workId}</code> : null}
              <span>{t(g.kind === "service" ? "kindService" : "kindPlan")}</span>
            </small>
          </span>
        </span>
      ),
    },
    { id: "term", label: t("term"), width: "minmax(90px,auto)", cell: (g) => <span className="dxcs-lead">{g.termMonths ? `${g.termMonths} ${t("months")}` : "—"}</span> },
    { id: "date", label: d("created"), width: "minmax(110px,auto)", cell: (g) => <span className="dxcs-lead">{g.createdAt ? dateOnly(g.createdAt, locale) : "—"}</span> },
    { id: "status", label: "", width: "minmax(110px,auto)", cell: (g) => <Tag tone={toneOf(g.status)}>{tg.has(g.status) ? tg(g.status) : g.status}</Tag> },
  ];

  return (
    <App
      name="cgifts"
      sidebar={<Sidebar label={t("title")} sections={sections} value={view} onChange={(v) => (setView(v as View), setSel(""))} />}
      inspector={
        cur ? (
          <aside className="dxcw-insp" aria-label={cur.title}>
            <header>
              <span className={`dxcw-ic is-big is-${toneOf(cur.status)}`} aria-hidden>
                <IconGift />
              </span>
              <h2>{cur.title || t("untitledGift")}</h2>
              <span className="dxcw-tags">
                {cur.workId ? <code className="dxcw-code">{cur.workId}</code> : null}
                <Tag tone={toneOf(cur.status)}>{tg.has(cur.status) ? tg(cur.status) : cur.status}</Tag>
                {cur.direction === "received" ? <Tag tone="ok">{t("gotIt")}</Tag> : null}
              </span>
            </header>
            <dl>
              {cur.termMonths ? (
                <div>
                  <dt>{t("term")}</dt>
                  <dd>{`${cur.termMonths} ${t("months")}`}</dd>
                </div>
              ) : null}
              {cur.direction !== "received" && cur.recipientPhone ? (
                <div>
                  <dt>{t("recipient")}</dt>
                  <dd>{cur.recipientPhone}</dd>
                </div>
              ) : null}
              {cur.createdAt ? (
                <div>
                  <dt>{d("created")}</dt>
                  <dd>{dateOnly(cur.createdAt, locale)}</dd>
                </div>
              ) : null}
            </dl>
            {cur.shareUrl && cur.direction !== "received" && cur.status !== "claimed" ? (
              <div className="dxcw-acts">
                <Btn icon={<IconCopy />} onClick={() => navigator.clipboard?.writeText(cur.shareUrl).then(() => say(t("copied")), () => undefined)}>
                  {t("copyLink")}
                </Btn>
                <Btn kind="plain" icon={<IconArrowRight />} onClick={() => window.open(cur.shareUrl, "_blank", "noopener")}>
                  {t("shareCta")}
                </Btn>
              </div>
            ) : null}
          </aside>
        ) : undefined
      }
    >
      <Toolbar title={view === "sent" ? t("send") : view === "received" ? t("gotIt") : t("title")}>
        <Tool icon={<IconPlus />} label={t("give")} onClick={() => setGiving(true)} primary />
      </Toolbar>
      <div className="dxcw-body">
        {gifts === null ? (
          <Loading label={t("title")} />
        ) : !rows.length ? (
          <Empty icon={<IconGift />} title={t("empty")} text={t("emptyText")} action={<Btn kind="primary" icon={<IconPlus />} onClick={() => setGiving(true)}>{t("give")}</Btn>} />
        ) : (
          <Table label={t("title")} cols={cols} rows={rows} rowKey={(g) => g.id} selected={sel} onSelect={(g) => setSel(g.id)} />
        )}
      </div>
      {giving ? <Give onClose={() => setGiving(false)} onMade={() => setTick((n) => n + 1)} /> : null}
      {toast}
    </App>
  );
}

// "Give a gift": a plan for some months, or one service.
function Give({ onClose, onMade }: { onClose: () => void; onMade: () => void }) {
  const t = useTranslations("portal.client.gifts");
  const tc = useTranslations("common");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const [plans, setPlans] = useState<BackendPlan[] | null>(null);
  const [services, setServices] = useState<BackendService[]>([]);
  const [kind, setKind] = useState<"plan" | "service">("plan");
  const [planId, setPlanId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [hint, setHint] = useState("");
  const [termPick, setTermPick] = useState(6);
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();
  const [err, setErr] = useState("");
  const [made, setMade] = useState<GiftResult | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    getSubscriptionPlans(locale)
      .then((l) => alive && setPlans(l))
      .catch(() => alive && setPlans([]));
    getAllServices(undefined, locale)
      .then((l) => alive && setServices(l.filter((s) => s.isActive)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [locale]);
  const giftable = (plans ?? []).filter((p) => p.isGiftable);
  const plan = giftable.find((p) => p.id === planId) || giftable[0] || null;
  const service = serviceId || services[0]?.id || "";
  const terms = plan?.allowedGiftDurations.length ? plan.allowedGiftDurations : TERMS;
  const term = terms.includes(termPick) ? termPick : terms[0];

  async function send() {
    if (busy || !once()) return;
    if (kind === "service" ? !service : !plan) return setErr(t("error"));
    setBusy(true);
    setErr("");
    try {
      const r = await createGift(kind === "service" ? { service_id: service, recipient_hint: hint.trim() || undefined } : { plan_slug: plan!.slug, duration_months: term, recipient_hint: hint.trim() || undefined });
      setMade(r);
      onMade();
      if (r.paymentUrl) window.open(r.paymentUrl, "_blank", "noopener");
    } catch (e) {
      setErr(isProviderUnavailable(e) || isDemoUnavailable(e) ? tc("paymentUnavailable") : t("createFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (made)
    return (
      <Dialog
        open
        title={t("shareTitle")}
        onClose={onClose}
        actions={
          <>
            {made.paymentUrl ? (
              <Btn icon={<IconArrowRight />} onClick={() => window.open(made.paymentUrl!, "_blank", "noopener")}>
                {t("openPayment")}
              </Btn>
            ) : null}
            <Btn kind="primary" onClick={onClose}>
              {t("done")}
            </Btn>
          </>
        }
      >
        <p className="dx-dlg__text">{t("shareHint")}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- the backend's own QR image */}
        {made.qrUrl ? <img className="dxcf-qr" src={made.qrUrl} alt={t("qrAlt")} width={148} height={148} onError={(e) => (e.currentTarget.style.display = "none")} /> : null}
        <span className="dxcf-share">
          <Input value={made.shareUrl} onChange={() => undefined} ariaLabel={t("copyLink")} />
          <Btn icon={copied ? <IconCheck /> : <IconCopy />} onClick={() => navigator.clipboard?.writeText(made.shareUrl).then(() => setCopied(true), () => undefined)}>
            {copied ? t("copied") : t("copyLink")}
          </Btn>
        </span>
      </Dialog>
    );

  return (
    <Dialog
      open
      title={t("give")}
      width={480}
      onClose={onClose}
      onSubmit={() => void send()}
      actions={
        <>
          <Btn onClick={onClose}>{d("cancel")}</Btn>
          <Btn kind="primary" type="submit" icon={<IconGift />} busy={busy} disabled={kind === "plan" ? !plan : !service}>
            {t("send")}
          </Btn>
        </>
      }
    >
      <Seg<"plan" | "service"> label={t("give")} value={kind} onChange={setKind} items={[{ id: "plan", label: t("kindPlan") }, { id: "service", label: t("kindService") }]} />
      {kind === "plan" ? (
        plans === null ? (
          <Loading label={t("plan")} />
        ) : !giftable.length ? (
          <Banner tone="neutral">{t("noPlans")}</Banner>
        ) : (
          <>
            {giftable.length > 1 ? (
              <Field label={t("plan")}>
                <Select value={plan?.id || ""} onChange={setPlanId} ariaLabel={t("plan")} options={giftable.map((p) => ({ value: p.id, label: p.name }))} />
              </Field>
            ) : plan ? (
              <Banner tone="info" title={plan.name}>
                {plan.description}
              </Banner>
            ) : null}
            <Field label={t("term")}>
              <span className="dxcp-chips">
                {terms.map((n) => (
                  <button key={n} type="button" className={n === term ? "is-on" : ""} aria-pressed={n === term} onClick={() => setTermPick(n)}>
                    {n} {t("months")}
                  </button>
                ))}
              </span>
            </Field>
          </>
        )
      ) : (
        <Field label={t("service")}>
          <Select value={service} onChange={setServiceId} ariaLabel={t("service")} options={services.length ? services.map((s) => ({ value: s.id, label: s.name })) : [{ value: "", label: "—" }]} />
        </Field>
      )}
      <Field label={t("recipient")}>
        <Input value={hint} onChange={setHint} placeholder={t("recipientHintPh")} />
      </Field>
      {kind === "plan" && plan && plan.monthlyPrice > 0 ? (
        <dl className="dxcp-bill">
          <div className="is-total">
            <dt>{`${t("estTotal")} · ${term} ${t("months")}`}</dt>
            <dd>{`${fmtUzs(estimate(plan, term))} ${t("som")}`}</dd>
          </div>
          <div className="is-sub">
            <dt>{t("estHint")}</dt>
          </div>
        </dl>
      ) : null}
      {err ? <Banner tone="err">{err}</Banner> : null}
    </Dialog>
  );
}
