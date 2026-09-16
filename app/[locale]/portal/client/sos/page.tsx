"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createSosRequest, type SosRequest } from "@/lib/services/backend";
import { HOTLINE, HOTLINE_TEL } from "@/lib/contact";
import {
  IconAlert,
  IconChat,
  IconShieldCheck,
  IconClock,
  IconPhone,
  IconScale,
  IconSearch,
  IconFileText,
  IconShield,
} from "@/components/icons";

const CATS = [
  { key: "arrest", Icon: IconShield },
  { key: "police", Icon: IconAlert },
  { key: "court", Icon: IconScale },
  { key: "search", Icon: IconSearch },
  { key: "contract", Icon: IconFileText },
  { key: "other", Icon: IconChat },
] as const;

export default function ClientSos() {
  const t = useTranslations("portal.client.sos");
  const router = useRouter();
  const [cat, setCat] = useState("");
  const [desc, setDesc] = useState("");
  const [stage, setStage] = useState<"idle" | "connecting" | "connected" | "sent">("idle");
  const [req, setReq] = useState<SosRequest | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="sos2">
      <div className="sos2__hero">
        <div className="sos2__glow" />
        <div className="sos2__heromain">
          <span className="sos2__pulse">
            <IconAlert />
          </span>
          <div>
            <h1 className="sos2__title">{t("title")}</h1>
            <p className="sos2__sub">{t("subtitle")}</p>
          </div>
        </div>
        <a className="sos2__herocall" href={HOTLINE_TEL}>
          <span className="sos2__calli"><IconPhone /></span>
          <span className="sos2__callt">
            <span className="sos2__calll">{t("callNow")}</span>
            <b>{HOTLINE}</b>
          </span>
        </a>
      </div>

      {stage === "idle" ? (
        <div className="sos2__grid">
          <div className="sos2__form">
            <h2 className="sos2__h2">{t("formTitle")}</h2>
            <label className="sos2__lbl">{t("catLabel")}</label>
            <div className="sos2__cats">
              {CATS.map(({ key, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`sos2__cat${cat === key ? " on" : ""}`}
                  onClick={() => setCat(key)}
                >
                  <span className="sos2__cati"><Icon /></span>
                  {t(`cat.${key}`)}
                </button>
              ))}
            </div>
            <label className="sos2__lbl">{t("descLabel")}</label>
            <textarea
              className="sos2__desc"
              rows={4}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t("descPh")}
            />
            <button className="sos2__btn" type="button" onClick={trigger} disabled={busy}>
              <IconAlert />
              {t("connect")}
            </button>
            <p className="sos2__hint">{t("hint")}</p>
          </div>

          <aside className="sos2__side">
            <div className="sos2__how">
              <h3 className="sos2__h3">{t("howTitle")}</h3>
              <ol className="sos2__steps">
                <li><span>1</span>{t("step1")}</li>
                <li><span>2</span>{t("step2")}</li>
                <li><span>3</span>{t("step3")}</li>
              </ol>
            </div>
            <div className="sos2__how">
              <h3 className="sos2__h3">{t("whyTitle")}</h3>
              <ul className="sos2__trust">
                <li><IconClock />{t("badge247")}</li>
                <li><IconShieldCheck />{t("badgePrivate")}</li>
                <li><IconPhone />{t("badgeFast")}</li>
              </ul>
            </div>
          </aside>
        </div>
      ) : null}

      {stage === "connecting" ? (
        <div className="sos2__status">
          <span className="sos2__spin" aria-hidden />
          <b>{t("connecting")}</b>
          <span>{t("connectingSub")}</span>
        </div>
      ) : null}

      {stage === "connected" && req ? (
        <div className="sos2__panel">
          <span className="sos2__ok"><IconShieldCheck /></span>
          <b>{t("connectedTitle")}</b>
          <div className="sos2__duty">
            <span className="sos2__av">{(req.dutyName || "A").slice(0, 1)}</span>
            <div>
              <b>{req.dutyName || t("dutyLawyer")}</b>
              <span>{t("dutyRole")}</span>
            </div>
          </div>
          <button
            className="btn btn--pri btn--full"
            type="button"
            onClick={() => req.roomId && router.push(`/portal/chat/${req.roomId}`)}
          >
            <IconChat />
            {t("openChat")}
          </button>
        </div>
      ) : null}

      {stage === "sent" ? (
        <div className="sos2__panel">
          <span className="sos2__ok"><IconShieldCheck /></span>
          <b>{t("sentTitle")}</b>
          <span className="sos2__psub">{t("sentSub")}</span>
          <a className="sos2__call sos2__call--sm" href={HOTLINE_TEL}>
            <span className="sos2__calli"><IconPhone /></span>
            <span className="sos2__callt">
              <span className="sos2__calll">{t("callNow")}</span>
              <b>{HOTLINE}</b>
            </span>
          </a>
          <button className="btn btn--soft" type="button" onClick={() => setStage("idle")}>
            {t("again")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
