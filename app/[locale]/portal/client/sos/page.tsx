"use client";

import "@/components/portal/sosIntake1920.css";
import { useEffect, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, CircleCheck, Clock, MessageSquareText, Phone, ShieldCheck, Siren, X, Zap } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cancelSosRequest, createSosRequest, getSosRequest, isSosNotCancellable, isSosOpen, listMySosRequests, type SosRequest } from "@/lib/services/backend";
import { HOTLINE, HOTLINE_TEL } from "@/lib/contact";
import { initials } from "@/lib/lawyers";
import { statusLabel } from "@/lib/labels";
import { fmtDateTime } from "@/lib/date";
import { notify } from "@/lib/toast";
import { logApiError } from "@/lib/http";

// The six situations, each with its black line drawing (public/img/sos), shown
// in a white circle as the dashboard shows its service pictures.
const CATS = [
  { key: "arrest", art: "Hibsga_olindi" },
  { key: "police", art: "Politsiya_chaqirdi" },
  { key: "court", art: "Sud_jarayoni" },
  { key: "search", art: "Tintuv" },
  { key: "contract", art: "Shoshilinch_shartnoma" },
  { key: "other", art: "Boshqa_holat" },
] as const;
const HERO_ART = "/img/xizmatlar/Shoshilinch_yordam.webp";
const artStyle = (src: string) => ({ "--art": `url(${src})` }) as CSSProperties;
const catArt = (key: string) => {
  const c = CATS.find((x) => x.key === key);
  return c ? `/img/sos/${c.art}.webp` : HERO_ART;
};
// An open SOS is re-read this often while the page is visible.
const SOS_REFRESH_MS = 20_000;

// BACKEND_FIXES_LIVE_2026-11-23: the client may cancel their own SOS (PATCH
// {status: "cancelled"}). Asked once more before it goes out; a finished SOS
// (409 sos_not_cancellable) is simply re-read.
function SosCancel({ req, onDone }: { req: SosRequest; onDone: (next: SosRequest | null) => void }) {
  const t = useTranslations("portal.client.sos");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  async function cancel() {
    if (busy) return;
    setBusy(true);
    try {
      await cancelSosRequest(req.id);
      notify.success(t("cancelled"), { id: `sos-cancel-${req.id}` });
      onDone(null);
    } catch (e) {
      if (isSosNotCancellable(e)) {
        notify.info(t("notCancellable"), { id: `sos-cancel-${req.id}` });
        onDone(await getSosRequest(req.id).catch(() => null));
      } else {
        logApiError("sos cancel", e);
        notify.error(t("cancelFailed"), { id: `sos-cancel-${req.id}`, error: e });
      }
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }
  if (!asking) {
    return (
      <button className="btn btn--line sosi-state__btn sosi-cancel__go" type="button" onClick={() => setAsking(true)} data-ai-target="button:sos-cancel">
        <X />
        {t("cancel")}
      </button>
    );
  }
  return (
    <div className="sosi-cancel" role="group" aria-label={t("cancelAsk")}>
      <b className="sosi-cancel__q">{t("cancelAsk")}</b>
      <div className="sosi-cancel__row">
        <button className="btn btn--line btn--sm" type="button" onClick={() => setAsking(false)} disabled={busy}>
          {t("cancelNo")}
        </button>
        <button className="btn btn--danger btn--sm" type="button" onClick={() => void cancel()} disabled={busy} aria-busy={busy || undefined} data-ai-target="button:sos-cancel-confirm">
          {busy ? t("cancelling") : t("cancelYes")}
        </button>
      </div>
    </div>
  );
}

export default function ClientSos() {
  const t = useTranslations("portal.client.sos");
  const tx = useTranslations("lxSos");
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const router = useRouter();
  const [cat, setCat] = useState("");
  const [desc, setDesc] = useState("");
  const [stage, setStage] = useState<"idle" | "connecting" | "connected" | "sent" | "active">("idle");
  const [req, setReq] = useState<SosRequest | null>(null);
  const [busy, setBusy] = useState(false);

  // An SOS sent earlier (another visit, another device) that is still open
  // is shown instead of an empty form (GET /sos/me, newest first).
  useEffect(() => {
    let alive = true;
    listMySosRequests(5)
      .then((rows) => {
        const open = rows.find(isSosOpen);
        if (!alive || !open) return;
        setStage((cur) => (cur === "idle" ? "active" : cur));
        setReq((cur) => cur ?? open);
      })
      .catch(() => {
        /* no list (older backend, offline): the form stays */
      });
    return () => {
      alive = false;
    };
  }, []);

  // While it is open, its status (and the operator's chat) is re-read.
  const watchId = stage === "active" && req ? req.id : "";
  useEffect(() => {
    if (!watchId) return;
    let alive = true;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      getSosRequest(watchId)
        .then((r) => {
          if (!alive) return;
          if (isSosOpen(r)) setReq(r);
          else {
            setReq(null);
            setStage("idle");
          }
        })
        .catch(() => {});
    };
    const iv = window.setInterval(tick, SOS_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [watchId]);

  // After a cancel: back to the form, or the record as it now stands.
  const afterCancel = (next: SosRequest | null) => {
    if (next && isSosOpen(next)) {
      setReq(next);
      return;
    }
    setReq(null);
    setStage("idle");
  };

  async function trigger() {
    if (busy) return;
    setBusy(true);
    setStage("connecting");
    try {
      const r = await createSosRequest({ category: cat || "other", description: desc.trim() });
      setReq(r);
      setStage(r.roomId ? "connected" : "sent");
    } catch {
      // Fail-soft: the emergency is logged locally; an operator calls back.
      setStage("sent");
    } finally {
      setBusy(false);
    }
  }

  // The page is the dashboard's vocabulary: the shell's header names it, the
  // banner is the flat SOS red with the emergency picture in a white circle,
  // the form and the side are .lx-card cards. The side stays beside every
  // state, so the column never jumps when the request goes out.
  return (
    <div className="sos2 sosi">
      <section className="sos2__hero sosi-hero" aria-label={t("title")}>
        <span className="sosi-hero__art" style={artStyle(HERO_ART)} aria-hidden />
        <div className="sos2__heromain sosi-hero__main">
          <p className="sos2__sub sosi-hero__lead">{t("subtitle")}</p>
          <p className="sosi-hero__note">{tx("sos.heroNote")}</p>
        </div>
        <a className="sos2__herocall sosi-call" href={HOTLINE_TEL} data-ai-target="sos:call">
          <span className="sos2__calli sosi-call__i"><Phone /></span>
          <span className="sos2__callt sosi-call__t">
            <span className="sos2__calll">{t("callNow")}</span>
            <b>{HOTLINE}</b>
          </span>
        </a>
      </section>

      <div className="sos2__grid sosi-grid">
        {stage === "idle" ? (
          <div className="sos2__form lx-card sosi-form">
            <h2 className="sos2__h2 cx-h3">{t("formTitle")}</h2>
            <p className="sos2__lbl sosi-lbl" id="sosi-cat-l">{t("catLabel")}</p>
            <div className="sos2__cats sosi-cats" role="group" aria-labelledby="sosi-cat-l" data-ai-target="sos:categories">
              {CATS.map(({ key, art }) => (
                <button
                  key={key}
                  type="button"
                  className={`sos2__cat sosi-cat${cat === key ? " on" : ""}`}
                  aria-pressed={cat === key}
                  onClick={() => setCat(key)}
                >
                  <span className="sosi-cat__art" style={artStyle(`/img/sos/${art}.webp`)} aria-hidden />
                  <span className="sosi-cat__t">{t(`cat.${key}`)}</span>
                  <span className="sosi-cat__ck" aria-hidden><Check /></span>
                </button>
              ))}
            </div>
            <label className="sos2__lbl sosi-lbl" htmlFor="sosi-desc">{t("descLabel")}</label>
            <textarea
              id="sosi-desc"
              className="sos2__desc sosi-desc"
              rows={4}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t("descPh")}
              data-ai-target="sos:description"
              data-ai-label={t("descLabel")}
            />
            <button className="sos2__btn sosi-go" type="button" onClick={trigger} disabled={busy} data-ai-target="button:sos-connect">
              <Siren />
              <span>{t("connect")}</span>
            </button>
            <p className="sos2__hint sosi-hint">{t("hint")}</p>
          </div>
        ) : null}

        {stage === "connecting" ? (
          <div className="sos2__status lx-card sosi-state" role="status">
            <span className="sosi-state__art" style={artStyle(HERO_ART)} aria-hidden>
              <i className="sos2__spin sosi-state__ring" />
            </span>
            <b className="sosi-state__t">{t("connecting")}</b>
            <span className="sosi-state__s">{t("connectingSub")}</span>
          </div>
        ) : null}

        {stage === "connected" && req ? (
          <div className="sos2__panel lx-card sosi-state" role="status">
            <span className="sos2__ok sosi-state__ok"><CircleCheck /></span>
            <b className="sosi-state__t">{t("connectedTitle")}</b>
            <div className="sos2__duty sosi-duty">
              <span className="sos2__av cx-av sosi-duty__av">{initials(req.dutyName || t("dutyLawyer"))}</span>
              <span className="sosi-duty__m">
                <span className="sosi-duty__n">{req.dutyName || t("dutyLawyer")}</span>
                <span className="sosi-duty__r">{t("dutyRole")}</span>
              </span>
            </div>
            <button
              className="btn btn--pri sosi-state__btn"
              type="button"
              onClick={() => req.roomId && router.push(`/portal/chat/${req.roomId}`)}
            >
              <MessageSquareText />
              {t("openChat")}
            </button>
            {req.id ? <SosCancel req={req} onDone={afterCancel} /> : null}
          </div>
        ) : null}

        {stage === "active" && req ? (
          <div className="sos2__panel lx-card sosi-state sosi-open" role="status">
            <span className="sosi-state__art" style={artStyle(catArt(req.category))} aria-hidden />
            <b className="sosi-state__t">{t("activeTitle")}</b>
            <span className="sos2__psub sosi-state__s">{t("activeSub")}</span>
            <dl className="sosi-facts">
              <div>
                <dt>{t("activeStatus")}</dt>
                <dd><span className="sosi-facts__st">{t.has(`statusOf.${req.status}`) ? t(`statusOf.${req.status}`) : statusLabel(tcm, req.status)}</span></dd>
              </div>
              {req.category ? (
                <div>
                  <dt>{t("catLabel")}</dt>
                  <dd>{t.has(`cat.${req.category}`) ? t(`cat.${req.category}`) : req.category}</dd>
                </div>
              ) : null}
              {req.createdAt ? (
                <div>
                  <dt>{t("activeSent")}</dt>
                  <dd>{fmtDateTime(req.createdAt, locale, false)}</dd>
                </div>
              ) : null}
            </dl>
            {req.dutyName ? (
              <div className="sos2__duty sosi-duty">
                <span className="sos2__av cx-av sosi-duty__av">{initials(req.dutyName)}</span>
                <span className="sosi-duty__m">
                  <span className="sosi-duty__n">{req.dutyName}</span>
                  <span className="sosi-duty__r">{t("dutyRole")}</span>
                </span>
              </div>
            ) : null}
            {req.roomId ? (
              <button className="btn btn--pri sosi-state__btn" type="button" onClick={() => req.roomId && router.push(`/portal/chat/${req.roomId}`)}>
                <MessageSquareText />
                {t("openChat")}
              </button>
            ) : null}
            <SosCancel req={req} onDone={afterCancel} />
          </div>
        ) : null}

        {stage === "sent" ? (
          <div className="sos2__panel lx-card sosi-state" role="status">
            <span className="sos2__ok sosi-state__ok"><CircleCheck /></span>
            <b className="sosi-state__t">{t("sentTitle")}</b>
            <span className="sos2__psub sosi-state__s">{t("sentSub")}</span>
            <a className="sos2__call sosi-hot" href={HOTLINE_TEL}>
              <span className="sosi-hot__i"><Phone /></span>
              <span className="sosi-hot__t">
                <span>{t("callNow")}</span>
                <b>{HOTLINE}</b>
              </span>
            </a>
            {req?.id ? <SosCancel req={req} onDone={afterCancel} /> : null}
            <button className="btn btn--line sosi-state__btn" type="button" onClick={() => setStage("idle")}>
              {t("again")}
            </button>
          </div>
        ) : null}

        <aside className="sos2__side sosi-side" data-ai-target="sos:how">
          <div className="sos2__how lx-card sosi-how">
            <h3 className="sos2__h3 cx-h3">{t("howTitle")}</h3>
            <ol className="sos2__steps sosi-steps">
              <li><span className="cx-count">1</span>{t("step1")}</li>
              <li><span className="cx-count">2</span>{t("step2")}</li>
              <li><span className="cx-count">3</span>{t("step3")}</li>
            </ol>
          </div>
          <div className="sos2__how lx-card sosi-how">
            <h3 className="sos2__h3 cx-h3">{t("whyTitle")}</h3>
            <ul className="sos2__trust sosi-trust">
              <li><span className="sosi-trust__i"><Clock /></span>{t("badge247")}</li>
              <li><span className="sosi-trust__i"><ShieldCheck /></span>{t("badgePrivate")}</li>
              <li><span className="sosi-trust__i"><Zap /></span>{t("badgeFast")}</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
