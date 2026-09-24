"use client";

import { useTranslations, useLocale } from "next-intl";
import { initials, humanizeSlug } from "@/lib/lawyers";
import { legalServiceLabel, type CatalogLocale } from "@/lib/legalServices";
import type { ProfessionalProfile } from "@/lib/types";
import {
  IconMapPin,
  IconShieldCheck,
  IconStar,
  IconClock,
  IconLanguage,
} from "../icons";

export default function ProfilePreview({ p }: { p: ProfessionalProfile }) {
  const t = useTranslations("register.advocate.review");
  const te = useTranslations("enums");
  const ta = useTranslations("register.advocate");
  const tl = useTranslations("register.languages");
  const ts = useTranslations("register.advocate.stats");
  const locale = useLocale() as CatalogLocale;

  const stats = p.stats;

  return (
    <div className="ppv">
      <div className="ppv__badge">
        <IconClock />
        {t("verifyPending")}
      </div>
      <div className="ppv__head">
        <span className="ppv__av">
          {p.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo} alt="" />
          ) : (
            initials(p.name || "A")
          )}
        </span>
        <div className="ppv__id">
          <div className="ppv__name">
            {p.name || "—"}
            <span className="ppv__verif">
              <IconShieldCheck />
            </span>
          </div>
          <div className="ppv__spec">
        {p.specialization ? (ta.has(`specOptions.${p.specialization}`) ? ta(`specOptions.${p.specialization}`) : p.specialization) : "—"}
      </div>
          <div className="ppv__meta">
            {p.region ? (
              <span>
                <IconMapPin />
                {te.has(`regions.${p.region}`) ? te(`regions.${p.region}`) : humanizeSlug(p.region)}
              </span>
            ) : null}
            <span>
              <IconStar />
              {stats
                ? (((stats.fullyWonCases + stats.partiallyWonCases) / Math.max(stats.totalCases, 1)) * 5).toFixed(1)
                : "5.0"}
            </span>
            <span>
              <IconClock />
              {p.advocateYears ?? p.experienceYears ?? 0} {t("yrs")}
            </span>
          </div>
        </div>
      </div>

      {stats ? (
        <div className="ppv__stats">
          {(["totalCases", "fullyWonCases", "partiallyWonCases", "successRate"] as const).map((k) => (
            <div key={k}>
              <b>
                {stats[k]}
                {k === "successRate" ? "%" : ""}
              </b>
              <span>{ts(k)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {p.practiceAreas.length ? (
        <div className="ppv__row">
          <label>{t("areas")}</label>
          <div className="ppv__chips">
            {p.practiceAreas.map((a) => (
              <span className="pill pill--glass" key={a}>
                {legalServiceLabel(a, locale)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {p.languages.length ? (
        <div className="ppv__row">
          <label>
            <IconLanguage />
            {t("langs")}
          </label>
          <div className="ppv__chips">
            {p.languages.map((l) => (
              <span className="pill pill--glass" key={l}>
                {tl(l)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {p.bio ? <p className="ppv__bio">{p.bio}</p> : null}
    </div>
  );
}
