"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getUrgentCatalog,
  createUrgentRequest,
  listMyUrgentRequests,
  urgentPrice,
  urgentMinutes,
  urgentChannels,
  isPriorPurchaseRequired,
  type UrgentCatalog,
  type UrgentService,
  type UrgentRequest,
} from "@/lib/services/backend";
import { errDetail, logApiError } from "@/lib/http";
import { REGION_KEYS } from "@/lib/lawyers";
import { fmtUzs } from "@/lib/money";
import { dateTimeFull } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { Link } from "@/i18n/navigation";
import Select from "@/components/Select";
import { Skeleton, EmptyState } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import {
  IconVideo,
  IconChat,
  IconUsers,
  IconScale,
  IconBolt,
  IconCheck,
  IconClock,
  IconLock,
  IconAlert,
  IconArrowRight,
  IconMapPin,
} from "@/components/icons";

// LEXGO_URGENT_ADVOCATE_FRONTEND_UPDATE.md — "Tezkor Advokat xizmati online".
// One module, four services. The two "second opinion" ones are only sold to a
// client who has bought from LexGo before (backend 402
// previous_lexgo_purchase_required), which this screen states up front rather
// than letting the client fill a whole form and then be refused.

const ICONS: Record<string, typeof IconVideo> = {
  video_consultation: IconVideo,
  chat_consultation: IconChat,
  second_opinion_single: IconScale,
  second_opinion_group: IconUsers,
};

// The documented payload sends the direction as the Uzbek slug
// (directions: ["jinoiy"]). The label beside it is the ordinary translated
// practice area, so the picker reads in the UI language whatever it sends.
const DIRECTIONS: { slug: string; area: string }[] = [
  { slug: "jinoiy", area: "criminal" },
  { slug: "fuqarolik", area: "civil" },
  { slug: "oila", area: "family" },
  { slug: "mehnat", area: "labor" },
  { slug: "mamuriy", area: "administrative" },
  { slug: "iqtisodiy", area: "economic" },
  { slug: "soliq", area: "tax" },
];

const GROUP = "second_opinion_group";
const SECOND_OPINION = new Set(["second_opinion_single", GROUP]);

export default function UrgentAdvocatePanel() {
  const t = useTranslations("portal.client.urgent");
  const te = useTranslations("enums");
  const tcm = useTranslations("portal.common");
  const locale = useLocale();

  const [cat, setCat] = useState<UrgentCatalog | null>(null);
  const [catState, setCatState] = useState<"loading" | "ready" | "error">("loading");
  const [mine, setMine] = useState<UrgentRequest[]>([]);
  const [mineState, setMineState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);

  const [pick, setPick] = useState("");
  // Stored as a PREFERENCE and resolved against what the picked service
  // offers, rather than corrected by an effect after the fact: switching to a
  // chat-only service must not leave one render showing a video price.
  const [channelPref, setChannelPref] = useState("video");
  const [lawyers, setLawyers] = useState(3);
  const [dirs, setDirs] = useState<string[]>([]);
  const [region, setRegion] = useState("tashkent");
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [gate, setGate] = useState("");

  useEffect(() => {
    let alive = true;
    getUrgentCatalog()
      .then((c) => { if (alive) { setCat(c); setCatState("ready"); } })
      .catch((e) => { if (alive) { logApiError("urgent catalog", e); setCatState("error"); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    listMyUrgentRequests()
      .then((r) => { if (alive) { setMine(r); setMineState("ready"); } })
      // A client who has never ordered one gets an empty list, not an error;
      // anything else is a real failure and says so.
      .catch((e) => { if (alive) { logApiError("urgent requests", e); setMineState("error"); } });
    return () => { alive = false; };
  }, [reload]);

  const services = useMemo(() => cat?.services ?? [], [cat]);
  const sel = useMemo(() => services.find((s) => s.key === pick), [services, pick]);
  const channels = urgentChannels(sel);
  const channel = channels.includes(channelPref) ? channelPref : channels[0] || "video";

  const isGroup = sel?.key === GROUP;
  const isSecond = !!sel && SECOND_OPINION.has(sel.key);
  const price = urgentPrice(sel, channel, isGroup ? lawyers : 1);
  const minutes = urgentMinutes(sel, channel);

  function choose(s: UrgentService) {
    setPick((cur) => (cur === s.key ? "" : s.key));
    setNote(null);
    setGate("");
    if (s.key === GROUP) setLawyers(Math.max(s.lawyerCountMin || 2, 3));
  }

  function toggleDir(slug: string) {
    setDirs((cur) => (cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug]));
  }

  const canSubmit = !!sel && need.trim().length >= 10 && (!isSecond || dirs.length > 0) && !busy;

  async function submit() {
    if (!sel || !canSubmit) return;
    setBusy(true);
    setNote(null);
    setGate("");
    try {
      await createUrgentRequest({
        serviceKind: sel.key,
        channel,
        need: need.trim(),
        region: isSecond ? undefined : region,
        directions: isSecond ? dirs : undefined,
        lawyerCount: isGroup ? lawyers : undefined,
      });
      setNote({ ok: true, msg: t("sent") });
      setNeed("");
      setPick("");
      setReload((k) => k + 1);
    } catch (e) {
      if (isPriorPurchaseRequired(e)) { setGate(errDetail(e) || t("priorPurchase")); return; }
      logApiError("urgent request", e);
      setNote({ ok: false, msg: errDetail(e) || t("sendError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ua">
      {/* ── Hero: what the module is, and the three numbers that govern
             every meeting inside it. ───────────────────────────────── */}
      <header className="ua__hero">
        <span className="ua__pulse" aria-hidden><IconBolt /></span>
        <div className="ua__heromain">
          <h1 className="ua__title">{cat?.title || t("title")}</h1>
          <p className="ua__sub">{t("lead")}</p>
        </div>
        {cat ? (
          <dl className="ua__meta">
            <div><dt>{t("metaMinutes")}</dt><dd>{t("minutesN", { n: cat.meetingDefaultMinutes })}</dd></div>
            <div><dt>{t("metaFree")}</dt><dd>{t("minutesN", { n: cat.freeExtensionOnceMinutes })}</dd></div>
            <div><dt>{t("metaPaid")}</dt><dd>{t("perMinute", { price: fmtUzs(cat.paidExtensionPricePerMinute) })}</dd></div>
          </dl>
        ) : null}
      </header>

      {/* ── The four services ─────────────────────────────────────── */}
      {catState === "loading" ? (
        <Skeleton rows={4} />
      ) : catState === "error" ? (
        <EmptyState icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} />
      ) : (
        <div className="ua__grid">
          {services.map((s) => {
            const Icon = ICONS[s.key] ?? IconScale;
            const on = pick === s.key;
            const from = urgentPrice(s, urgentChannels(s)[0] || "video", s.lawyerCountMin || 1);
            return (
              <button
                key={s.key}
                type="button"
                className={`uacard${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => choose(s)}
              >
                <span className="uacard__i"><Icon /></span>
                <b className="uacard__t">{t.has(`kinds.${s.key}`) ? t(`kinds.${s.key}`) : s.title}</b>
                <span className="uacard__p">
                  {s.variants.some((v) => v.pricePerLawyer) ? t("fromPerLawyer", { price: fmtUzs(from / Math.max(1, s.lawyerCountMin || 1)) }) : t("from", { price: fmtUzs(from) })}
                </span>
                <span className="uacard__f">
                  {urgentChannels(s).includes("video") ? <em><IconVideo />{t("chVideo")}</em> : null}
                  {urgentChannels(s).includes("chat") || s.supportsChat ? <em><IconChat />{t("chChat")}</em> : null}
                  {urgentMinutes(s, "video") ? <em><IconClock />{t("minutesN", { n: urgentMinutes(s, "video") })}</em> : null}
                </span>
                {s.requiresPriorPurchase ? (
                  <span className="uacard__lock"><IconLock />{t("priorPurchaseShort")}</span>
                ) : null}
                <span className="uacard__go" aria-hidden><IconArrowRight /></span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Configurator for the picked service ───────────────────── */}
      {sel ? (
        <section className="ppanel ua__form">
          <div className="ppanel__h">
            <b className="ppanel__t"><span className="pico"><IconBolt /></span>{t.has(`kinds.${sel.key}`) ? t(`kinds.${sel.key}`) : sel.title}</b>
            <span className="advmuted">{t("formLead")}</span>
          </div>

          <div className="cform" style={{ maxWidth: "none" }}>
            {channels.length > 1 ? (
              <div>
                <label>{t("channel")}</label>
                <div className="segs segs--sm" role="tablist" aria-label={t("channel")}>
                  {channels.map((c) => (
                    <button key={c} type="button" role="tab" className="seg" aria-selected={channel === c} onClick={() => setChannelPref(c)}>
                      {c === "video" ? <IconVideo /> : <IconChat />}
                      {c === "video" ? t("chVideo") : t("chChat")}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isGroup ? (
              <div>
                <label htmlFor="ua-n">{t("lawyerCount")}</label>
                <div className="ua__count">
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setLawyers((n) => Math.max(sel.lawyerCountMin || 2, n - 1))} aria-label={t("less")}>−</button>
                  <b id="ua-n">{lawyers}</b>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setLawyers((n) => Math.min(sel.lawyerCountMax || 7, n + 1))} aria-label={t("more")}>+</button>
                  <span className="advmuted">{t("lawyerRange", { min: sel.lawyerCountMin || 2, max: sel.lawyerCountMax || 7 })}</span>
                </div>
              </div>
            ) : null}

            {isSecond ? (
              <div>
                <label>{t("directions")}</label>
                <div className="chiprow" style={{ margin: "4px 0 0" }}>
                  {DIRECTIONS.map((d) => (
                    <button key={d.slug} type="button" className="fchip" aria-pressed={dirs.includes(d.slug)} onClick={() => toggleDir(d.slug)}>
                      {te.has(`areas.${d.area}`) ? te(`areas.${d.area}`) : d.slug}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label>{t("region")}</label>
                <Select
                  value={region}
                  onChange={setRegion}
                  ariaLabel={t("region")}
                  options={REGION_KEYS.map((k) => ({ value: k, label: te.has(`regions.${k}`) ? te(`regions.${k}`) : k }))}
                />
              </div>
            )}

            <div>
              <label htmlFor="ua-need">{t("need")}</label>
              <textarea
                id="ua-need"
                rows={4}
                value={need}
                onChange={(e) => setNeed(e.target.value)}
                placeholder={t("needPh")}
              />
              <span className="rf__hint">{t("needHint")}</span>
            </div>

            {/* Price, duration and what happens next — before the button, so
                nothing about the order is a surprise after it is pressed. */}
            <div className="ua__sum">
              <div className="ua__sumrow">
                <span>{t("total")}</span>
                <b>{fmtUzs(price)} {te("currency")}</b>
              </div>
              {minutes ? (
                <div className="ua__sumrow ua__sumrow--sub">
                  <span><IconClock />{t("meetingLen")}</span>
                  <span>{t("minutesN", { n: minutes })}</span>
                </div>
              ) : null}
              {isGroup ? (
                <div className="ua__sumrow ua__sumrow--sub">
                  <span><IconUsers />{t("perLawyerNote")}</span>
                  <span>{fmtUzs(urgentPrice(sel, channel, 1))} × {lawyers}</span>
                </div>
              ) : null}
              <p className="ua__next"><IconCheck />{isGroup ? t("nextGroup") : t("next")}</p>
              {sel.supportsFiles || sel.supportsVoice ? <p className="ua__next ua__next--muted"><IconChat />{t("filesInChat")}</p> : null}
            </div>

            {gate ? (
              <div className="ua__gate" role="alert">
                <b><IconLock />{t("priorPurchaseTitle")}</b>
                <span>{gate}</span>
                <Link href="/portal/client/services" className="btn btn--line btn--sm">{t("browseServices")}</Link>
              </div>
            ) : null}
            {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

            <button type="button" className="btn btn--grad btn--full btn--lg" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? t("sending") : t("submit")}
            </button>
          </div>
        </section>
      ) : null}

      {/* ── The client's own requests ─────────────────────────────── */}
      <section className="ppanel">
        <div className="ppanel__h">
          <b className="ppanel__t"><span className="pico"><IconClock /></span>{t("mine")}</b>
        </div>
        {mineState === "loading" ? (
          <Skeleton rows={2} />
        ) : mineState === "error" ? (
          <EmptyState icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} />
        ) : !mine.length ? (
          <EmptyState icon={<IconBolt />} title={t("mineEmpty")} text={t("mineEmptyText")} />
        ) : (
          <ul className="ua__list">
            {mine.map((r) => {
              const RowIcon = ICONS[r.serviceKind] ?? IconScale;
              return (
              <li key={r.id} className="ua__row">
                <span className="ua__rowi"><RowIcon /></span>
                <div className="ua__rowm">
                  <b>{t.has(`kinds.${r.serviceKind}`) ? t(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind}</b>
                  <span>{[r.need, r.createdAt ? dateTimeFull(r.createdAt, locale) : ""].filter(Boolean).join(" · ")}</span>
                  {r.scheduledAt ? (
                    <span className="ua__when"><IconClock />{t("scheduled", { when: dateTimeFull(r.scheduledAt, locale) })}</span>
                  ) : null}
                  {r.region ? <span className="ua__when"><IconMapPin />{te.has(`regions.${r.region}`) ? te(`regions.${r.region}`) : r.region}</span> : null}
                </div>
                <div className="ua__rowr">
                  <em className={`creq__badge ua__st ua__st--${r.status || "open"}`}>{statusLabel(tcm, r.status)}</em>
                  {r.secureChatRoomId ? (
                    <Link href="/portal/client/messages" className="btn btn--line btn--sm"><IconChat />{t("openChat")}</Link>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
