"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getMyReferral, type Referral } from "@/lib/services/backend";
import { httpBlob } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { dateOnly } from "@/lib/date";
import { IconCheck, IconCopy, IconGift, IconSend, IconUsers } from "@/components/icons";
import { App, Avatar, Btn, Loading, Progress, Tag, Toolbar, useOs, useToast } from "../kit/kit";
import type { NativeProps } from "../native";
import "./referrals.css";

// Referrals as a desktop program: the code and the link to share (copy or
// the system share sheet), the QR to show, what invitations have brought,
// the discount and how far it is, the three steps, and who joined.

export default function ReferralsApp(_props: NativeProps) {
  void _props;
  const t = useTranslations("portal.client.referrals");
  const d = useTranslations("portal.desk.ref");
  const locale = useLocale();
  const os = useOs();
  const [r, setR] = useState<(Referral & { qrUrl: string }) | null>(null);
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState("");
  const [toast, say] = useToast();
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => setOrigin(window.location.origin), 0);
    getMyReferral()
      .then((x) => alive && setR(x))
      .catch(() => alive && setR({ code: "", link: "", registerUrl: "", landingUrl: "", qrUrl: "", invited: 0, joined: 0, rewardBalance: 0, discountUnlocked: false, discountPercent: 5, eligibleAfter: 5, remainingToUnlock: 5, appliesTo: "subscription", items: [] }));
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, []);
  useEffect(() => {
    if (!r?.qrUrl) return;
    if (/^(data:image\/|https:\/\/)/i.test(r.qrUrl)) {
      const h = setTimeout(() => setQr(r.qrUrl), 0);
      return () => clearTimeout(h);
    }
    let made = "";
    httpBlob(r.qrUrl.startsWith("/") ? r.qrUrl : `/${r.qrUrl}`, { headers: { Accept: "image/*" } })
      .then((b) => b.type.startsWith("image/") && setQr((made = URL.createObjectURL(b))))
      .catch(() => undefined);
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [r?.qrUrl]);
  const code = r?.code || "LEXGO";
  const link = r?.link || (origin ? `${origin}/register?ref=${code}` : "");
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => say(t("copied"))).catch(() => undefined);
  const share = () => (navigator.share ? navigator.share({ title: "LexGo", text: t("shareText"), url: link }).catch(() => undefined) : copy(link));
  const need = r ? r.eligibleAfter || 5 : 5;
  const done = r ? Math.max(0, need - (r.remainingToUnlock || 0)) : 0;
  return (
    <App name="ref">
      <Toolbar title={t("title")} subtitle={t("subtitle")} />
      {r === null ? (
        <Loading label={d("loading")} />
      ) : (
        <div className="dxf2 dx-scroll">
          <section className="dxf2-hero">
            <span className="dxf2-hero__ic" aria-hidden>
              <IconGift />
            </span>
            <div className="dxf2-code">
              <small>{d("yourCode")}</small>
              <b>{code}</b>
              <Btn small icon={<IconCopy />} onClick={() => void copy(code)}>
                {t("copy")}
              </Btn>
            </div>
            <div className="dxf2-link">
              <small>{t("link")}</small>
              <span>
                <input readOnly value={link} aria-label={t("link")} onFocus={(e) => e.currentTarget.select()} />
                <Btn small icon={<IconCopy />} onClick={() => void copy(link)}>
                  {t("copy")}
                </Btn>
                <Btn small kind="primary" icon={<IconSend />} onClick={() => void share()}>
                  {t("share")}
                </Btn>
              </span>
            </div>
            {qr ? (
              <figure className="dxf2-qr">
                {/* eslint-disable-next-line @next/next/no-img-element -- the backend's own QR image */}
                <img src={qr} alt={t("qrAlt")} width={132} height={132} />
                <figcaption>{t("qrHint")}</figcaption>
              </figure>
            ) : null}
          </section>
          <div className="dxf2-stats">
            <div>
              <b>{r.invited}</b>
              <span>{t("invited")}</span>
            </div>
            <div>
              <b>{r.joined}</b>
              <span>{t("joined")}</span>
            </div>
            <div className="is-reward">
              <b>{fmtUzs(r.rewardBalance) || "0"}</b>
              <span>{t("reward")}</span>
            </div>
          </div>
          <section className="dxf2-box">
            <p>{r.discountUnlocked ? t("discountActive", { percent: r.discountPercent || 5 }) : t("discountProgress", { remaining: r.remainingToUnlock || need, percent: r.discountPercent || 5 })}</p>
            {!r.discountUnlocked ? <Progress value={(done / need) * 100} label={d("progress")} /> : <Tag tone="ok">{d("unlocked")}</Tag>}
          </section>
          <section className="dxf2-box">
            <h3>{t("howTitle")}</h3>
            <ol className="dxf2-steps">
              {(["step1", "step2", "step3"] as const).map((s, i) => (
                <li key={s}>
                  <i>{i + 1}</i>
                  <span>{t(s)}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="dxf2-box">
            <h3>
              <IconUsers aria-hidden />
              {t("invitesTitle")}
            </h3>
            {r.items.length ? (
              <ul className="dxf2-list">
                {r.items.map((it, i) => (
                  <li key={i}>
                    <Avatar name={it.name || it.phone || "?"} size={os === "mac" ? 30 : 32} />
                    <span>
                      <b>{it.name || it.phone || "—"}</b>
                      <small>{[it.name ? it.phone : "", t.has(`status.${it.status}`) ? t(`status.${it.status}`) : it.status, it.joinedAt ? dateOnly(it.joinedAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                    </span>
                    {it.reward ? (
                      <Tag tone="ok">
                        <IconCheck aria-hidden />+{fmtUzs(it.reward)}
                      </Tag>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dxf2-muted">{t("empty")}</p>
            )}
          </section>
        </div>
      )}
      {toast}
    </App>
  );
}
