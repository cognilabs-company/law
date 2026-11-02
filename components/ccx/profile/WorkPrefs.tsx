"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { CCX_BACKGROUNDS, CCX_THEMES, setCcxPrefs, useCcxPrefs } from "@/lib/ccx/prefs";
import { IcAppearance, IcCheck, IcKeys, IcMoon, IcSun, IcWave } from "../icons";

const LANG_NAMES: Record<string, string> = { uz: "O'zbekcha", ru: "Русский", en: "English" };

export default function WorkPrefs() {
  const t = useTranslations("admin.ccx.look");
  const tx = useTranslations("admin.ccx");
  const tm = useTranslations("admin.ccx.myProfile");
  const prefs = useCcxPrefs();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const switchLocale = (code: (typeof routing.locales)[number]) => {
    if (code === locale) return;
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { locale: code });
  };

  return (
    <section className="opx-pf-card opx-pf-work" aria-labelledby="opx-pf-work-t" data-ai-target="staff-profile:work">
      <header className="opx-pf-card__head">
        <span className="opx-pf-card__ic" aria-hidden="true">
          <IcAppearance size={18} />
        </span>
        <span className="opx-pf-card__t">
          <h3 id="opx-pf-work-t">{tm("workTitle")}</h3>
          <small>{t("lead")}</small>
        </span>
      </header>

      <div className="opx-pf-work__sec">
        <span className="opx-pf-work__l" id="opx-pf-theme">
          {t("theme")}
        </span>
        <div className="opx-look__themes" role="radiogroup" aria-labelledby="opx-pf-theme">
          {CCX_THEMES.map((th) => (
            <button key={th} type="button" role="radio" aria-checked={prefs.theme === th} className={`opx-look__theme${prefs.theme === th ? " is-on" : ""}`} onClick={() => setCcxPrefs({ theme: th })}>
              <span className="opx-look__swatch" data-th={th} data-bg={prefs.bg} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="opx-look__name">
                {th === "dark" ? <IcMoon size={17} /> : <IcSun size={17} />}
                {t(`themes.${th}`)}
              </span>
              {prefs.theme === th ? <IcCheck size={16} className="opx-look__ok" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="opx-pf-work__sec">
        <span className="opx-pf-work__l" id="opx-pf-bg">
          {t("background")}
        </span>
        <div className="opx-look__bgs opx-pf-work__bgs" role="radiogroup" aria-labelledby="opx-pf-bg">
          {CCX_BACKGROUNDS.map((b) => (
            <button key={b} type="button" role="radio" aria-checked={prefs.bg === b} className={`opx-look__bg${prefs.bg === b ? " is-on" : ""}`} onClick={() => setCcxPrefs({ bg: b })}>
              <span className="opx-look__thumb" data-th={prefs.theme} data-bg={b} aria-hidden="true">
                <i />
              </span>
              <span className="opx-look__bname">{t(`bgs.${b}`)}</span>
              {prefs.bg === b ? <IcCheck size={14} className="opx-look__ok" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="opx-pf-work__switches">
        <label className="opx-look__switch">
          <span className="opx-look__swic" aria-hidden="true">
            <IcWave size={18} />
          </span>
          <span className="opx-look__swtxt">
            <b>{t("motion")}</b>
            <small>{t("motionHint")}</small>
          </span>
          <input type="checkbox" role="switch" checked={prefs.motion} onChange={(e) => setCcxPrefs({ motion: e.target.checked })} />
          <i className="opx-look__toggle" aria-hidden="true" />
        </label>
        <label className="opx-look__switch">
          <span className="opx-look__swic" aria-hidden="true">
            <IcKeys size={18} />
          </span>
          <span className="opx-look__swtxt">
            <b>{t("keys")}</b>
            <small>{t("keysHint")}</small>
          </span>
          <input type="checkbox" role="switch" checked={prefs.keys} onChange={(e) => setCcxPrefs({ keys: e.target.checked })} />
          <i className="opx-look__toggle" aria-hidden="true" />
        </label>
      </div>

      <div className="opx-pf-work__lang">
        <span className="opx-pf-work__l" id="opx-pf-lang">
          {tx("language")}
        </span>
        <div className="opx-pf-seg" role="group" aria-labelledby="opx-pf-lang">
          {routing.locales.map((code) => (
            <button key={code} type="button" lang={code} aria-pressed={code === locale} className={code === locale ? "is-on" : undefined} onClick={() => switchLocale(code)}>
              {code === locale ? <IcCheck size={14} /> : null}
              {LANG_NAMES[code] ?? code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
