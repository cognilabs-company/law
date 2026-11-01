"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import CheckBox from "@/components/CheckBox";
import { IconChartBar, IconExternal, IconMap, IconMegaphone, IconShieldCheck } from "@/components/icons";
import {
  ALL_OPTIONAL,
  CONSENT_CATEGORIES,
  NO_OPTIONAL,
  closeConsentSettings,
  openConsentSettings,
  saveConsent,
  type ConsentCategory,
  type ConsentChoices,
} from "@/lib/consent";
import { useConsentRecord, useConsentSettingsOpen } from "@/lib/useConsent";
import { dateOnly } from "@/lib/date";
import { notify } from "@/lib/toast";
import "./cookieConsent.css";

// The cookie banner and its settings dialog (lib/consent.ts). Not a dark
// pattern: "Reject all", "Accept all" and "Settings" are the same button,
// side by side; no category is on before the visitor turns it on; closing
// the dialog without saving changes nothing; the choice can be changed any
// time from the footer's "Cookie settings". The banner does not cover the
// page or trap focus — the site works while it is open, with only the
// necessary cookies.

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
// The services each optional category covers today; an empty list says so.
const SERVICES: Record<ConsentCategory, { key: string; third: boolean; policy?: string }[]> = {
  functional: [{ key: "yandex", third: true, policy: "https://yandex.ru/legal/confidential/" }],
  analytics: [],
  marketing: [{ key: "lexgo", third: false }],
};
const ICONS: Record<ConsentCategory | "necessary", Icon> = {
  necessary: IconShieldCheck,
  functional: IconMap,
  analytics: IconChartBar,
  marketing: IconMegaphone,
};

function CookieMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="ckc-mark">
      <path d="M16 3.5a12.5 12.5 0 1 0 12.4 14.1 4.2 4.2 0 0 1-5.6-4.3 4.2 4.2 0 0 1-4.6-5.3A4.2 4.2 0 0 1 16 3.5Z" />
      <circle cx="11" cy="13" r="1.7" />
      <circle cx="12.5" cy="21" r="1.7" />
      <circle cx="19.5" cy="19.5" r="1.4" />
      <circle cx="17" cy="25" r="1" />
    </svg>
  );
}

export default function CookieConsent() {
  const t = useTranslations("cookies");
  const rec = useConsentRecord();
  const open = useConsentSettingsOpen();

  const decide = (choices: ConsentChoices) => {
    saveConsent(choices);
    closeConsentSettings();
    notify.success(t("settings.saved"), { id: "cookie-consent" });
  };

  return (
    <>
      {rec === null && !open ? (
        <section className="ckc" role="region" aria-labelledby="ckc-title" data-ai-id="cookies.banner">
          <div className="ckc__top">
            <span className="ckc__ic">
              <CookieMark />
            </span>
            <div className="ckc__tx">
              <h2 id="ckc-title" className="ckc__t">
                {t("banner.title")}
              </h2>
              <p className="ckc__p">
                {t("banner.text")}{" "}
                <Link href="/legal/cookie" className="ckc__lnk">
                  {t("banner.policy")}
                </Link>
              </p>
            </div>
          </div>
          <div className="ckc__acts">
            <button type="button" className="ckc__btn" onClick={() => decide(NO_OPTIONAL)} data-ai-id="cookies.banner.reject">
              {t("banner.reject")}
            </button>
            <button type="button" className="ckc__btn" onClick={() => decide(ALL_OPTIONAL)} data-ai-id="cookies.banner.accept">
              {t("banner.accept")}
            </button>
            <button type="button" className="ckc__btn ckc__btn--set" onClick={openConsentSettings} data-ai-id="cookies.banner.settings">
              {t("banner.settings")}
            </button>
          </div>
        </section>
      ) : null}
      {open ? <CookieSettings initial={rec?.choices ?? NO_OPTIONAL} at={rec?.at ?? null} onDecide={decide} /> : null}
    </>
  );
}

function CookieSettings({ initial, at, onDecide }: { initial: ConsentChoices; at: number | null; onDecide: (c: ConsentChoices) => void }) {
  const t = useTranslations("cookies");
  const locale = useLocale();
  const [draft, setDraft] = useState<ConsentChoices>(initial);
  const Necessary = ICONS.necessary;

  return (
    <Modal
      open
      onClose={closeConsentSettings}
      title={t("settings.title")}
      icon={<CookieMark />}
      aiId="cookies.settings"
      size="md"
      description={
        <>
          {t("settings.lead")}{" "}
          <Link href="/legal/cookie" className="ckc__lnk" onClick={closeConsentSettings}>
            {t("banner.policy")}
          </Link>
          {at ? <span className="ckc-when">{t("settings.decided", { date: dateOnly(new Date(at).toISOString(), locale) })}</span> : null}
        </>
      }
      footer={
        <div className="ckc-foot">
          <button type="button" className="ckc__btn" onClick={() => onDecide(NO_OPTIONAL)} data-ai-id="cookies.settings.reject">
            {t("banner.reject")}
          </button>
          <button type="button" className="ckc__btn" onClick={() => onDecide(draft)} data-ai-id="cookies.settings.save">
            {t("settings.save")}
          </button>
          <button type="button" className="ckc__btn" onClick={() => onDecide(ALL_OPTIONAL)} data-ai-id="cookies.settings.accept">
            {t("banner.accept")}
          </button>
        </div>
      }
    >
      <ul className="ckc-cats">
        <li className="ckc-cat" data-cat="necessary">
          <span className="ckc-cat__ic" aria-hidden="true">
            <Necessary />
          </span>
          <div className="ckc-cat__main">
            <div className="ckc-cat__head">
              <b id="ckc-cat-necessary">{t("cat.necessary.name")}</b>
              <span className="ckc-pill">{t("settings.alwaysOn")}</span>
            </div>
            <p>{t("cat.necessary.text")}</p>
          </div>
        </li>
        {CONSENT_CATEGORIES.map((k) => {
          const CatIcon = ICONS[k];
          const list = SERVICES[k];
          return (
            <li key={k} className="ckc-cat" data-cat={k} data-on={draft[k] ? "" : undefined}>
              <span className="ckc-cat__ic" aria-hidden="true">
                <CatIcon />
              </span>
              <div className="ckc-cat__main">
                <CheckBox checked={draft[k]} onChange={(on) => setDraft((d) => ({ ...d, [k]: on }))} className="ckc-cat__cbx" id={`ckc-${k}`}>
                  <b>{t(`cat.${k}.name`)}</b>
                </CheckBox>
                <p>{t(`cat.${k}.text`)}</p>
                <div className="ckc-svc">
                  <span className="ckc-svc__h">{t("settings.services")}</span>
                  {list.length ? (
                    <ul>
                      {list.map((s) => (
                        <li key={s.key}>
                          <span className="ckc-svc__row">
                            <b>{t(`svc.${s.key}.name`)}</b>
                            <span className="ckc-svc__who">{s.third ? t("settings.thirdParty") : t("settings.firstParty")}</span>
                          </span>
                          <span className="ckc-svc__tx">{t(`svc.${s.key}.text`)}</span>
                          {s.policy ? (
                            <a href={s.policy} target="_blank" rel="noopener noreferrer" className="ckc__lnk ckc-svc__ext">
                              {t("settings.privacyOf", { name: t(`svc.${s.key}.name`) })}
                              <IconExternal aria-hidden="true" />
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ckc-svc__none">{t("settings.none")}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
