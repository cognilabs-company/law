"use client";

import "@/components/portal/plans1920.css";
import { useEffect, useState, type CSSProperties } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Check, CircleCheck, Copy, Hourglass, Share2, UserPlus, Users } from "lucide-react";
import { getMyReferral } from "@/lib/services/backend";
import { httpBlob } from "@/lib/http";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, ErrorState } from "@/components/portal/DataState";
import { initials } from "@/lib/lawyers";
import { dateOnly } from "@/lib/date";

const som = (n: number) => fmtUzs(n);
// The dashboard's pictures: the black line drawing in a white circle on the
// navy banner, the navy + blue ones on the light plates of the step cards.
const mArt = (name: string) => ({ "--art": `url(/img/xizmatlar/${name}.webp)` }) as CSSProperties;
const dPlate = (name: string) => ({ "--img": `url(/img/doc-catalog/${name}.webp)` }) as CSSProperties;
const STEP_ART = ["Referal_ulashish", "Referal_qoshilish", "Referal_bonus"] as const;

// Referral QR image: a data:/https URL is used as is; a backend-relative path
// is an authed route, fetched with the token as a blob. null = nothing to show.
function useQrSrc(qrUrl: string): string | null {
  const [src, setSrc] = useState<{ key: string; url: string | null } | null>(null);
  const direct = /^(data:image\/|https:\/\/)/i.test(qrUrl);
  useEffect(() => {
    if (!qrUrl || direct) return;
    let alive = true;
    let objectUrl = "";
    httpBlob(qrUrl.startsWith("/") ? qrUrl : `/${qrUrl}`, { headers: { Accept: "image/*" } })
      .then((b) => {
        if (!alive) return;
        if (!b.type.startsWith("image/")) {
          setSrc({ key: qrUrl, url: null });
          return;
        }
        objectUrl = URL.createObjectURL(b);
        setSrc({ key: qrUrl, url: objectUrl });
      })
      .catch(() => alive && setSrc({ key: qrUrl, url: null }));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [qrUrl, direct]);
  if (!qrUrl) return null;
  if (direct) return qrUrl;
  return src?.key === qrUrl ? src.url : null;
}

const fmtDate = (s: string, locale: string) => {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : dateOnly(s, locale);
};

export default function ClientReferrals() {
  const t = useTranslations("portal.client.referrals");
  const tl = useTranslations("lxPlans.ref");
  const locale = useLocale();
  // Bumped by "Qayta urinish": useResourceOne re-runs on a new dependency.
  const [reload, setReload] = useState(0);
  const res = useResourceOne(getMyReferral, [reload]);
  const r = res.data;
  // Only ever the client's own code: when /referrals/me fails there is no
  // code to show, and a made-up one would be shared as if it were theirs.
  const code = r?.code || "";
  const link = r ? r.link || (code && typeof window !== "undefined" ? `${window.location.origin}/register?ref=${code}` : "") : "";
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const qrSrc = useQrSrc(r?.qrUrl ?? "");
  const [qrBroken, setQrBroken] = useState(false);

  function copy(what: "code" | "link", text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }
  function share() {
    if (navigator.share) navigator.share({ title: "LexGo", text: t("shareText"), url: link }).catch(() => {});
    else copy("link", link);
  }

  const steps = ["step1", "step2", "step3"] as const;
  const goal = r ? r.eligibleAfter || 5 : 5;
  const joinedTowards = r ? Math.min(r.joined, goal) : 0;
  const percent = r?.discountPercent || 5;

  return (
    <div className="ref plx-ref">
      {/* The dashboard's navy banner, left-aligned: the invite picture in a
          white circle, the offer, then the code and the link in one tray
          and the QR on a white plate beside them. The page title is the
          shell header's, so the banner opens with its own line. */}
      <section className="ref__hero cx-gift plx-refhero" aria-labelledby="plx-ref-h">
        <span className="plx-refhero__art" style={mArt("Dost_taklif")} aria-hidden />
        <div className="plx-refhero__main">
          <h2 id="plx-ref-h" className="ref__title">{tl("bannerTitle")}</h2>
          <p className="ref__sub">{t("subtitle")}</p>
          {res.status === "loading" ? (
            <div className="plx-reftray plx-reftray--wait" aria-busy="true" />
          ) : r && code ? (
            <div className="plx-reftray">
              <div className="ref__code plx-reftray__code" data-ai-target="referrals:code">
                <span className="plx-reftray__l">{tl("code")}</span>
                <span className="ref__codeval">{code}</span>
                <button type="button" className="ref__copy btn btn--soft btn--sm" onClick={() => copy("code", code)}>
                  {copied === "code" ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied === "code" ? t("copied") : t("copy")}
                </button>
              </div>
              <div className="ref__linkrow plx-reftray__link" data-ai-target="referrals:share">
                <input readOnly value={link} className="ref__link" aria-label={t("link")} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn--pri" onClick={share}>
                  <Share2 aria-hidden />
                  {t("share")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        {r && qrSrc && !qrBroken ? (
          <div className="ref__qr plx-refqr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt={t("qrAlt")} width={132} height={132} onError={() => setQrBroken(true)} />
            <span>{t("qrHint")}</span>
          </div>
        ) : null}
      </section>

      {res.status === "loading" ? (
        <Skeleton rows={2} />
      ) : !r ? (
        <div className="lx-card plx-emptycard">
          <ErrorState onRetry={() => setReload((k) => k + 1)} />
        </div>
      ) : (
        // The numbers and the way to the discount, in one card.
        <section className="lx-card plx-refstat">
            <div className="ref__stats plx-kpis" data-ai-target="referrals:stats">
              <div className="ref__stat"><b>{r.invited}</b><span>{t("invited")}</span></div>
              <div className="ref__stat"><b>{r.joined}</b><span>{t("joined")}</span></div>
              <div className="ref__stat ref__stat--reward"><b>{som(r.rewardBalance)}</b><span>{t("reward")}</span></div>
            </div>
            <div className={`ref__disc plx-goal${r.discountUnlocked ? " ref__disc--on" : ""}`} data-ai-target="referrals:discount">
              <div className="plx-goal__h">
                <b>{tl("goalTitle")}</b>
                {r.discountUnlocked ? (
                  <span className="cx-pill cx-pill--ok"><CircleCheck aria-hidden />{tl("goalOn", { percent })}</span>
                ) : (
                  <span className="plx-goal__n">{tl("goalMeta", { joined: joinedTowards, goal })}</span>
                )}
              </div>
              <p>
                {r.discountUnlocked
                  ? t("discountActive", { percent })
                  : t("discountProgress", {
                      remaining: r.remainingToUnlock || r.eligibleAfter || 5,
                      percent,
                    })}
              </p>
              {/* one segment per friend the discount needs, as .cx-steps */}
              <span className="cx-steps cx-steps--blue plx-goal__bar" style={{ gridTemplateColumns: `repeat(${goal}, minmax(0, 1fr))` }} aria-hidden>
                {Array.from({ length: goal }, (_, i) => <i key={i} className={r.discountUnlocked || i < joinedTowards ? "on" : undefined} />)}
              </span>
            </div>
          </section>
      )}

      {/* How it works: three picture cards, as the dashboard's area cards. */}
      <section className="ref__how plx-how" data-ai-target="referrals:how">
        <div className="cx-head plx-head">
          <div className="plx-head__t">
            <h2 className="ref__h2 lx-h1">{t("howTitle")}</h2>
            <p className="lx-sub">{tl("howSub")}</p>
          </div>
        </div>
        <ol className="ref__steps plx-steps">
          {steps.map((s, i) => (
            <li className="ref__step cx-area plx-step" key={s}>
              <span className="cx-area__img" style={dPlate(STEP_ART[i])} aria-hidden />
              <span className="cx-area__body">
                <span className="ref__num">{i + 1}</span>
                <span className="cx-area__txt"><b>{t(s)}</b></span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {r ? (
        <section className="ppanel plx-list" data-ai-target="referrals:invites">
          <div className="ppanel__h cx-works__h">
            <h3 className="cx-h3">
              {t("invitesTitle")}
              {r.items.length ? <span className="cx-count">{r.items.length}</span> : null}
            </h3>
          </div>
          {r.items.length === 0 ? (
            <div className="cx-empty">
              <span className="cx-empty__ic"><Users aria-hidden /></span>
              <b>{tl("emptyTitle")}</b>
              <p>{tl("emptyText")}</p>
              {link ? (
                <button type="button" className="btn btn--pri btn--sm" onClick={share}>
                  <Share2 aria-hidden />
                  {tl("shareLink")}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="alist plx-rows">
              {r.items.map((it, i) => {
                const st = it.status === "rewarded" ? "ok" : it.status === "joined" ? "blue" : "wait";
                return (
                  <div className="creq cx-work plx-inv" key={i}>
                    <span className="cx-av" aria-hidden>{it.name ? initials(it.name) : <UserPlus />}</span>
                    <div className="creq__m">
                      <b>{it.name || it.phone || "—"}</b>
                      <span>{[it.name ? it.phone : "", fmtDate(it.joinedAt, locale)].filter(Boolean).join(" · ")}</span>
                    </div>
                    {it.reward ? <b className="ref__badge plx-inv__sum">+{som(it.reward)}</b> : null}
                    <span className={`cx-pill ${st === "ok" ? "cx-pill--ok" : st === "blue" ? "cx-pill--blue" : "plx-pill--off"}`}>
                      {st === "ok" ? <CircleCheck aria-hidden /> : st === "blue" ? <Check aria-hidden /> : <Hourglass aria-hidden />}
                      {t.has(`status.${it.status}`) ? t(`status.${it.status}`) : it.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
