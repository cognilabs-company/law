"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createSosRequest, type SosRequest } from "@/lib/services/backend";
import { HOTLINE, HOTLINE_TEL } from "@/lib/contact";
import { IconAlert, IconChat, IconClock, IconFileText, IconPhone, IconScale, IconSearch, IconShield, IconShieldCheck } from "@/components/icons";
import { App, Avatar, Btn, Spinner, TextArea } from "../../kit/kit";
import type { NativeProps } from "../../native";
import "./client.css";

// Emergency help as a desktop program — the Mac's Emergency SOS panel,
// Windows' urgent-alert window: the hotline to call at once, what is
// happening (detained, police, court, a search, a contract, other) and a
// few words, then one red button that brings the duty advocate. While it
// connects the window says so; connected, it names the advocate and opens
// the chat; if nobody picks up the request is logged and an operator calls
// back.

const CATS = [
  { key: "arrest", Icon: IconShield },
  { key: "police", Icon: IconAlert },
  { key: "court", Icon: IconScale },
  { key: "search", Icon: IconSearch },
  { key: "contract", Icon: IconFileText },
  { key: "other", Icon: IconChat },
] as const;

type Stage = "idle" | "connecting" | "connected" | "sent";

export default function SosApp({ openLink }: NativeProps) {
  const t = useTranslations("portal.client.sos");
  const [cat, setCat] = useState("");
  const [desc, setDesc] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [req, setReq] = useState<SosRequest | null>(null);

  async function trigger() {
    if (stage === "connecting") return;
    setStage("connecting");
    try {
      const r = await createSosRequest({ category: cat || "other", description: desc.trim() });
      setReq(r);
      setStage(r.roomId ? "connected" : "sent");
    } catch {
      // Fail-soft, as on the web: the emergency is logged and an operator calls back.
      setStage("sent");
    }
  }

  const call = (
    <a className="dxcz-call" href={HOTLINE_TEL}>
      <span aria-hidden>
        <IconPhone />
      </span>
      <span>
        <small>{t("callNow")}</small>
        <b>{HOTLINE}</b>
      </span>
    </a>
  );

  return (
    <App name="csos">
      <div className="dxcz dx-scroll">
        <header className="dxcz-hero">
          <span className="dxcz-pulse" aria-hidden>
            <IconAlert />
          </span>
          <span className="dxcz-hero__t">
            <h1>{t("title")}</h1>
            <p>{t("subtitle")}</p>
          </span>
          {call}
        </header>

        {stage === "idle" ? (
          <div className="dxcz-cols">
            <form
              className="dxcz-box dxcz-form"
              onSubmit={(e) => {
                e.preventDefault();
                void trigger();
              }}
            >
              <h2>{t("formTitle")}</h2>
              <span className="dxcz-l">{t("catLabel")}</span>
              <div className="dxcz-cats" role="radiogroup" aria-label={t("catLabel")}>
                {CATS.map(({ key, Icon }) => (
                  <button key={key} type="button" role="radio" aria-checked={cat === key} className={cat === key ? "is-on" : ""} onClick={() => setCat(key)}>
                    <Icon aria-hidden />
                    <span>{t(`cat.${key}`)}</span>
                  </button>
                ))}
              </div>
              <span className="dxcz-l">{t("descLabel")}</span>
              <TextArea value={desc} onChange={setDesc} placeholder={t("descPh")} rows={4} ariaLabel={t("descLabel")} />
              <button type="submit" className="dxcz-go">
                <IconAlert aria-hidden />
                {t("connect")}
              </button>
              <p className="dxcz-hint">{t("hint")}</p>
            </form>
            <aside className="dxcz-side">
              <section className="dxcz-box">
                <h3>{t("howTitle")}</h3>
                <ol className="dxcs-steps">
                  {[t("step1"), t("step2"), t("step3")].map((s, i) => (
                    <li key={i}>
                      <i>{i + 1}</i>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="dxcz-box">
                <h3>{t("whyTitle")}</h3>
                <ul className="dxcz-trust">
                  <li>
                    <IconClock aria-hidden /> {t("badge247")}
                  </li>
                  <li>
                    <IconShieldCheck aria-hidden /> {t("badgePrivate")}
                  </li>
                  <li>
                    <IconPhone aria-hidden /> {t("badgeFast")}
                  </li>
                </ul>
              </section>
            </aside>
          </div>
        ) : (
          <section className="dxcz-box dxcz-state" role="status">
            {stage === "connecting" ? (
              <>
                <Spinner />
                <b>{t("connecting")}</b>
                <p>{t("connectingSub")}</p>
              </>
            ) : stage === "connected" && req ? (
              <>
                <span className="dxcz-ok" aria-hidden>
                  <IconShieldCheck />
                </span>
                <b>{t("connectedTitle")}</b>
                <span className="dxcz-duty">
                  <Avatar name={req.dutyName || "A"} size={40} />
                  <span>
                    <b>{req.dutyName || t("dutyLawyer")}</b>
                    <small>{t("dutyRole")}</small>
                  </span>
                </span>
                <Btn kind="primary" icon={<IconChat />} onClick={() => req.roomId && openLink({ appId: "", route: `/portal/chat/${req.roomId}` })}>
                  {t("openChat")}
                </Btn>
              </>
            ) : (
              <>
                <span className="dxcz-ok" aria-hidden>
                  <IconShieldCheck />
                </span>
                <b>{t("sentTitle")}</b>
                <p>{t("sentSub")}</p>
                {call}
                <Btn onClick={() => setStage("idle")}>{t("again")}</Btn>
              </>
            )}
          </section>
        )}
      </div>
    </App>
  );
}
