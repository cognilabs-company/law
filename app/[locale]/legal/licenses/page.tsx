import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import notices from "@/lib/licenses/notices.json";
import "@/components/legal/licenses.css";

type Props = { params: Promise<{ locale: string }> };

type Pkg = { name: string; version: string; license: string; usedAs?: string; copyright: string[]; url: string; text: number };
type Text = { license: string; body: string };

const PACKAGES = notices.packages as Pkg[];
const TEXTS = notices.texts as Text[];
const OFL = TEXTS.findIndex((t) => t.license === "OFL-1.1");

// The fonts next/font self-hosts, and DejaVu Sans from public/fonts.
const FONTS = [
  { name: "Inter", use: "ui", license: "SIL Open Font License 1.1", copyright: "Copyright 2016 The Inter Project Authors", url: "https://github.com/rsms/inter" },
  { name: "Onest", use: "display", license: "SIL Open Font License 1.1", copyright: "Copyright 2021 The Onest Project Authors", url: "https://github.com/simpals/onest" },
  { name: "Poppins", use: "accent", license: "SIL Open Font License 1.1", copyright: "Copyright 2020 The Poppins Project Authors", url: "https://github.com/itfoundry/Poppins" },
  { name: "Inter Tight", use: "display", license: "SIL Open Font License 1.1", copyright: "Copyright 2022 The Inter Tight Project Authors", url: "https://github.com/googlefonts/inter-tight" },
  { name: "Playfair Display", use: "accent", license: "SIL Open Font License 1.1", copyright: "Copyright 2017 The Playfair Display Project Authors", url: "https://github.com/clauseggers/Playfair" },
  { name: "DejaVu Sans", use: "doc", license: "Bitstream Vera Fonts licence", copyright: "Copyright (c) 2003 Bitstream, Inc.; DejaVu changes are in the public domain", url: "https://dejavu-fonts.github.io", file: "/fonts/LICENSE.txt" },
] as const;

const ART = ["illustrations", "robot", "backgrounds", "icons", "models"] as const;

// Packages with no standard text of their own, and where their terms are.
const TERMS: Record<string, { note?: "gsap" | "libvips"; url: string }> = {
  gsap: { note: "gsap", url: "https://gsap.com/standard-license" },
  "@img/sharp-libvips-linux-x64": { note: "libvips", url: "https://github.com/libvips/libvips" },
  "@img/sharp-libvips-linuxmusl-x64": { note: "libvips", url: "https://github.com/libvips/libvips" },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "licenses" });
  return { title: t("title") };
}

function Row({ p, t }: { p: Pkg; t: Awaited<ReturnType<typeof getTranslations<"licenses">>> }) {
  const terms = TERMS[p.name];
  return (
    <li className="lic-pkg">
      <div className="lic-pkg__head">
        <b lang="en">{p.name}</b>
        <span className="lic-pkg__v">{p.version}</span>
        <span className="lic-tag" lang="en">
          {p.license === "GSAP-Standard" ? "GSAP Standard" : p.license}
        </span>
      </div>
      {p.copyright.length ? (
        <p className="lic-pkg__c" lang="en">
          {p.copyright.join(" · ")}
        </p>
      ) : null}
      {p.usedAs ? <p className="lic-pkg__n">{t("pkg.usedAs", { license: p.usedAs })}</p> : null}
      {terms?.note ? <p className="lic-pkg__n">{t(`pkg.${terms.note}`)}</p> : p.text < 0 && !terms ? <p className="lic-pkg__n">{t("pkg.noFile")}</p> : null}
      {terms?.url || p.url ? (
        <a className="lic-pkg__a" href={terms?.url ?? p.url} target="_blank" rel="noopener noreferrer">
          {terms ? t("pkg.terms") : t("pkg.home")}
        </a>
      ) : null}
    </li>
  );
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "licenses" });

  // One card per licence text, the packages that use it inside; packages
  // without a text of their own go to "Other terms".
  const groups = TEXTS.map((text, i) => ({ i, text, pkgs: PACKAGES.filter((p) => p.text === i) })).filter((g) => g.pkgs.length);
  groups.sort((a, b) => b.pkgs.length - a.pkgs.length || a.text.license.localeCompare(b.text.license));
  const other = PACKAGES.filter((p) => p.text < 0);
  const kinds = new Set([...PACKAGES.map((p) => p.usedAs ?? p.license), ...FONTS.map((f) => f.license)]).size;

  return (
    <section className="sec legal lic">
      <div className="wrap legal__in">
        <div className="head">
          <span className="kick">LexGo</span>
          <h1 className="h2">{t("title")}</h1>
          <p className="lead">{t("lead")}</p>
        </div>
        <ul className="lic-stats">
          <li>{t.rich("stats.packages", { n: PACKAGES.length, b: (c) => <b>{c}</b> })}</li>
          <li>{t.rich("stats.licenses", { n: kinds, b: (c) => <b>{c}</b> })}</li>
          <li>{t.rich("stats.fonts", { n: FONTS.length, b: (c) => <b>{c}</b> })}</li>
        </ul>
        <nav className="lic-nav" aria-label={t("nav")}>
          <a href="#fonts">{t("fonts.title")}</a>
          <a href="#art">{t("art.title")}</a>
          <a href="#packages">{t("pkg.title")}</a>
        </nav>

        <h2 id="fonts" className="lic-h">
          {t("fonts.title")}
        </h2>
        <p className="lic-lead">{t("fonts.lead")}</p>
        <ul className="lic-fonts">
          {FONTS.map((f) => (
            <li key={f.name} className="lic-font">
              <span className="lic-font__aa" aria-hidden="true" style={{ fontFamily: f.name === "Inter" ? "var(--fb)" : f.name === "Onest" ? "var(--fd)" : f.name === "Poppins" ? "var(--font-poppins)" : "var(--fdoc)" }}>
                Aa
              </span>
              <div className="lic-font__b">
                <b lang="en">{f.name}</b>
                <span>{t(`fonts.${f.use}`)}</span>
                <span className="lic-tag" lang="en">
                  {f.license}
                </span>
                <p className="lic-pkg__c" lang="en">
                  {f.copyright}
                </p>
                <a className="lic-pkg__a" href={"file" in f ? f.file : f.url} target="_blank" rel="noopener noreferrer">
                  {"file" in f ? t("fonts.file") : t("pkg.home")}
                </a>
              </div>
            </li>
          ))}
        </ul>
        {OFL >= 0 ? (
          <details className="lic-text">
            <summary>
              {t("pkg.showText")} <span lang="en">· SIL Open Font License 1.1</span>
            </summary>
            <pre lang="en">{TEXTS[OFL].body}</pre>
          </details>
        ) : null}

        <h2 id="art" className="lic-h">
          {t("art.title")}
        </h2>
        <p className="lic-lead">{t("art.lead")}</p>
        <ul className="lic-art">
          {ART.map((k) => (
            <li key={k}>{t(`art.${k}`)}</li>
          ))}
        </ul>

        <h2 id="packages" className="lic-h">
          {t("pkg.title")}
        </h2>
        <p className="lic-lead">{t("pkg.lead")}</p>
        <div className="lic-groups">
          {groups.map((g) => (
            <article key={g.i} className="lic-group">
              <header className="lic-group__h">
                <h3 lang="en">{g.text.license}</h3>
                <span>{t("pkg.count", { n: g.pkgs.length })}</span>
              </header>
              <ul className="lic-pkgs">
                {g.pkgs.map((p) => (
                  <Row key={`${p.name}@${p.version}`} p={p} t={t} />
                ))}
              </ul>
              <details className="lic-text">
                <summary>{t("pkg.showText")}</summary>
                <pre lang="en">{g.text.body}</pre>
              </details>
            </article>
          ))}
          {other.length ? (
            <article className="lic-group">
              <header className="lic-group__h">
                <h3>{t("pkg.other")}</h3>
                <span>{t("pkg.count", { n: other.length })}</span>
              </header>
              <p className="lic-lead">{t("pkg.otherLead")}</p>
              <ul className="lic-pkgs">
                {other.map((p) => (
                  <Row key={`${p.name}@${p.version}`} p={p} t={t} />
                ))}
              </ul>
            </article>
          ) : null}
        </div>
        <p className="legal__note">{t("note")}</p>
      </div>
    </section>
  );
}
