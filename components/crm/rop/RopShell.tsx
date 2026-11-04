"use client";

import "@/components/portal/shell/shell1920.css";
import "./rop.css";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Building2, PanelLeftClose, Search } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { IconClose, IconLogo, IconMenu } from "@/components/icons";
import { initials } from "@/lib/lawyers";
import { weekdayDate } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { listCrmLeads } from "@/lib/services/crm";
import { listApprovalDrafts } from "@/lib/services/crmAutomation";
import { useCrmEvents, useCrmMeta } from "@/lib/crm/useCrm";
import { AccountMenu, LangSelect } from "@/components/portal/shell/LxHeaderTools";
import { LiveDot } from "../bits";
import { ROP_NAV, ropActive, ropVisible, type RopItem } from "./ropNav";
import { RopCtx } from "./ropCtx";

// The ROP (sales supervisor) workspace: the LexGo 1920 cabinet shell — the
// dark navy sidebar with grouped rows, the header with the date line, big
// title, search, language and account menu — around the CRM pages. The menu
// is built only after GET /crm/meta answers (ROP contract §2, §4).


const GROUPS: RopItem["group"][] = ["", "work", "robots", "tools"];

export default function RopShell({
  name,
  roleBadge,
  profileHref,
  hrm,
  onLogout,
  extra,
  children,
}: {
  name: string;
  roleBadge: string;
  profileHref: string;
  hrm: boolean;
  onLogout: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("rop");
  const tx = useTranslations("lxShell");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { meta, error } = useCrmMeta();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => {
      try { if (localStorage.getItem("lexgo_rop_collapsed") === "1") setCollapsed(true); } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(h);
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try { localStorage.setItem("lexgo_rop_collapsed", c ? "0" : "1"); } catch { /* ignore */ }
      return !c;
    });

  const items = ropVisible(meta);
  const active = ropActive(items, pathname);
  // A row whose permission was revoked (or the landing page itself without
  // crm.analytics.self) sends the visitor to the first page still open.
  const gated = !!meta && !active && !!ropActive(ROP_NAV, pathname);
  const firstHref = items[0]?.href ?? "";
  useEffect(() => {
    if (gated && firstHref) router.replace(firstHref);
  }, [gated, firstHref, router]);
  const title = active ? t(`nav.${active.key}`) : t("title");
  const badges = useRopBadges(!!meta && items.some((i) => i.key === "drafts"), !!meta && items.some((i) => i.key === "leads"));

  const [q, setQ] = useState("");
  const search = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    setQ("");
    router.push(`/admin/crm/leads?tab=all&q=${encodeURIComponent(v)}`);
  };

  return (
    <RopCtx.Provider value={true}>
      <div className={`portal lx rop${collapsed ? " psb-collapsed" : ""}`}>
        <div className={`psb__scrim${open ? " on" : ""}`} onClick={() => setOpenPath(null)} />
        <aside className={`psb lx-sb${open ? " on" : ""}${collapsed ? " collapsed" : ""}`} aria-label={t("menu")}>
          <div className="psb__brand lx-sb__brand">
            <Link href="/admin/crm" className="lx-sb__logo" aria-label="LexGo">
              <span className="lx-sb__mark">
                <IconLogo />
              </span>
              <span className="psb__label">LexGo</span>
            </Link>
            <span className="lx-sb__role">{roleBadge}</span>
            <button className="lx-sb__x" type="button" aria-label={tx("closeMenu")} onClick={() => setOpenPath(null)}>
              <IconClose />
            </button>
          </div>
          <nav className="psb__nav lx-sb__nav" aria-label={t("menu")} aria-busy={!meta || undefined}>
            {!meta ? (
              error ? (
                <p className="rop-nav__note">{t("metaFailed")}</p>
              ) : (
                <div className="rop-nav__sk" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, i) => <i key={i} />)}
                </div>
              )
            ) : (
              GROUPS.map((g) => {
                const rows = items.filter((i) => i.group === g);
                if (!rows.length) return null;
                return (
                  <div className="lx-sb__grp" key={g || "top"}>
                    {g ? (
                      <span className="lx-sb__glabel">
                        <span className="psb__label">{t(`groups.${g}`)}</span>
                      </span>
                    ) : null}
                    {rows.map(({ key, href, Icon }) => {
                      const on = active?.key === key;
                      const label = t(`nav.${key}`);
                      const n = key === "drafts" ? badges.drafts : key === "leads" ? badges.queue : 0;
                      return (
                        <Link key={key} href={href} className={`psb__link lx-sb__link${on ? " on" : ""}`} aria-current={on ? "page" : undefined} title={collapsed ? label : undefined} data-ai-target={`nav:crm-${key}`} data-rop-nav={key} onClick={() => setOpenPath(null)}>
                          <Icon />
                          <span className="psb__label">{label}</span>
                          {n > 0 ? <b className="lx-sb__badge" aria-label={t(key === "drafts" ? "badgeDrafts" : "badgeQueue", { n })}>{n > 99 ? "99+" : n}</b> : null}
                        </Link>
                      );
                    })}
                  </div>
                );
              })
            )}
          </nav>
          <div className="psb__foot lx-sb__foot">
            <Link href={profileHref} className="lx-sb__me" title={name}>
              <span className="lx-sb__av">{initials(name || "R")}</span>
              <span className="lx-sb__who psb__label">
                <b>{name}</b>
                <small>{roleBadge}</small>
              </span>
            </Link>
            <button className="lx-sb__fold psb__collapse" type="button" onClick={toggleCollapsed} title={tx(collapsed ? "expand" : "collapse")} aria-label={tx(collapsed ? "expand" : "collapse")}>
              <PanelLeftClose />
            </button>
          </div>
        </aside>

        <div className="pmain">
          <div className="pbody" tabIndex={-1}>
            <header className="ptop lx-top">
              <button className="ptop__burger lx-top__burger" type="button" aria-label={tx(open ? "closeMenu" : "openMenu")} onClick={() => setOpenPath(open ? null : pathname)}>
                {open ? <IconClose /> : <IconMenu />}
              </button>
              <div className="lx-top__head">
                <p className="lx-top__meta">
                  {weekdayDate(new Date(), locale)} · {t("crumb")}
                </p>
                <h1 data-ai-target="ai-help:current-page">{title}</h1>
              </div>
              <div className="ptop__sp lx-top__tools">
                <form className="lx-search" role="search" onSubmit={search}>
                  <Search aria-hidden="true" />
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} />
                </form>
                <span className="rop-live"><LiveDot /></span>
                {hrm ? (
                  <Link className="lx-pill rop-hrm" href="/internal" title="HRM">
                    <Building2 aria-hidden="true" />
                    <span>HRM</span>
                  </Link>
                ) : null}
                <LangSelect />
                <AccountMenu name={name} profileHref={profileHref} isAdmin={false} onLogout={onLogout} />
              </div>
            </header>
            <div className="pbody__in">{gated ? <div className="rop-sk" aria-busy="true" style={{ height: 240 }} /> : children}</div>
          </div>
        </div>
        {extra}
      </div>
    </RopCtx.Provider>
  );
}

// The sidebar counters: approval drafts waiting for a decision and leads in
// the common queue. Read on mount and again (debounced) when the CRM socket
// says something changed.
function useRopBadges(drafts: boolean, queue: boolean): { drafts: number; queue: number } {
  const [n, setN] = useState({ drafts: 0, queue: 0 });
  const timer = useRef<number | undefined>(undefined);
  const load = useCallback(() => {
    const ctl = new AbortController();
    void Promise.allSettled([drafts ? listApprovalDrafts({ status: "pending_approval", limit: 1 }, ctl.signal) : Promise.resolve(null), queue ? listCrmLeads({ queueOnly: true, limit: 1 }, ctl.signal) : Promise.resolve(null)]).then(([d, l]) => {
      if (d.status === "rejected" && !isAborted(d.reason)) logApiError("rop.badges.drafts", d.reason);
      if (l.status === "rejected" && !isAborted(l.reason)) logApiError("rop.badges.queue", l.reason);
      setN({ drafts: d.status === "fulfilled" && d.value ? d.value.total : 0, queue: l.status === "fulfilled" && l.value ? l.value.total : 0 });
    });
    return () => ctl.abort();
  }, [drafts, queue]);
  useEffect(() => load(), [load]);
  useCrmEvents((ev) => {
    if (!ev.invalidate.some((x) => x === "all" || x === "automation" || x === "queue" || x === "counts")) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(load, 800);
  });
  return n;
}
