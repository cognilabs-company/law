"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";
import { IconLogo } from "./icons";

const MAIN = [
  { href: "/chat", key: "chat" },
  { href: "/ai", key: "ai" },
  { href: "/lawyers", key: "lawyers" },
  { href: "/services", key: "services" },
  { href: "/subscription", key: "subscription" },
  { href: "/for-lawyers", key: "forLawyers" },
] as const;

const SHEET = [
  ...MAIN,
  { href: "/business", key: "business" },
  { href: "/warranty", key: "warranty" },
  { href: "/app", key: "app" },
  { href: "/faq", key: "faq" },
  { href: "/contact", key: "contact" },
] as const;

// Routes with a dark full-bleed hero: the bar stays transparent until scroll.
const OVER_HERO = new Set<string>(["/"]);

export default function Navbar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  // The sheet is open only on the path it was opened on, so navigating closes it.
  const [sheetPath, setSheetPath] = useState<string | null>(null);
  const sheet = sheetPath === pathname;

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", on, { passive: true });
    on();
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    document.body.style.overflow = sheet ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheet]);

  const solid = scrolled || !OVER_HERO.has(pathname);

  return (
    <>
      <header className={`bar${solid ? " on" : ""}`}>
        <div className="wrap">
          <div className="bar__in">
            <Link href="/" className="logo">
              <span className="logo__m">
                <IconLogo />
              </span>
              LexGo
            </Link>
            <nav className="nav">
              {MAIN.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={pathname === l.href ? "page" : undefined}
                >
                  {t(l.key)}
                </Link>
              ))}
            </nav>
            <div className="bar__act">
              <ThemeToggle />
              <LanguageSwitcher />
              <Link href="/login" className="btn btn--glass btn--sm">
                {t("login")}
              </Link>
              <Link href="/chat" className="btn btn--pri btn--sm">
                {t("start")}
              </Link>
              <button
                className="burg"
                aria-expanded={sheet}
                aria-controls="sheet"
                aria-label={t("menu")}
                onClick={() => setSheetPath(sheet ? null : pathname)}
              >
                <i />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        className={`sheet${sheet ? " on" : ""}`}
        id="sheet"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSheetPath(null);
        }}
      >
        <div className="sheet__c">
          {SHEET.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setSheetPath(null)}>
              {t(l.key)}
            </Link>
          ))}
          <div className="sheet__b">
            <Link href="/login" className="btn btn--line btn--full">
              {t("login")}
            </Link>
            <Link href="/chat" className="btn btn--grad btn--full">
              {t("register")}
            </Link>
            <ThemeToggle variant="segmented" />
            <div style={{ marginTop: 6 }}>
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
