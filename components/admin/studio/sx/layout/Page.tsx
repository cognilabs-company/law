"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../editor/sx-record-head.css";
import { useEffect, useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { recheckStudio, studioErrorOf, useStudioAccess, type StudioAccess } from "@/lib/services/studio";
import { useScrollEdges } from "@/lib/useScrollEdges";
import { SxButton } from "../Button";
import { prefersReducedMotion } from "../hooks";
import { HouseIcon } from "lucide-react";
import { ArrowLeftIcon, RefreshCwIcon, ChevronRightIcon, LockIcon, LayersIcon, NAV_ICON, SxIconScope, glyph } from "../icons";
import type { SxCrumb, SxNeed, SxSection } from "../types";
import { SxEmpty } from "./Empty";
import { SxNote } from "./Note";
import { scrollParent } from "./util";

export type SxPageProps = {
  title: string;
  layout?: "page" | "record";
  look?: "neon";
  icon?: ReactNode;
  section?: SxSection | null;
  crumbs?: readonly SxCrumb[];
  lead?: ReactNode;
  status?: ReactNode;
  statusWhenStuck?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  need?: SxNeed;
  aiId?: string;
  children: ReactNode;
};

const NAV: readonly { key: SxSection; href: string; need: SxNeed }[] = [
  { key: "home", href: "/admin/studio", need: "any" },
  { key: "approvals", href: "/admin/studio/approvals", need: "review" },
  { key: "monitoring", href: "/admin/studio/monitoring", need: "admin" },
  { key: "settings", href: "/admin/studio/settings", need: "admin" },
];

const ROOT_HREF = "/admin/studio";
const SK_TABS = [0, 1, 2];

export function allowedBy(acc: Pick<StudioAccess, "any" | "canEdit" | "canReview" | "canPublish" | "isAdmin">, need: SxNeed): boolean {
  if (need === "any") return acc.any;
  if (need === "edit") return acc.canEdit;
  if (need === "review") return acc.canReview;
  if (need === "publish") return acc.canPublish;
  return acc.isAdmin;
}

export type SxGate = "checking" | "off" | "error" | "denied" | "open";

export function gateOf(acc: Pick<StudioAccess, "avail" | "error" | "any" | "canEdit" | "canReview" | "canPublish" | "isAdmin">, need: SxNeed): SxGate {
  if (acc.avail === "checking") return "checking";
  if (acc.avail === "off") return "off";
  if (acc.error && !acc.any) return studioErrorOf(acc.error).kind === "forbidden" ? "denied" : "error";
  return allowedBy(acc, need) ? "open" : "denied";
}

type Ink = { x: number; w: number };

let lastInk: Ink | null = null;

function StudioNav({ section, acc, checking, base }: { section: SxSection | null; acc: StudioAccess; checking: boolean; base: string }) {
  const t = useTranslations("studio");
  const pathname = usePathname();
  const list = useRef<HTMLUListElement>(null);
  const ink = useRef<HTMLLIElement>(null);
  useScrollEdges(list, { silent: true });
  const items = NAV.filter((n) => allowedBy(acc, n.need));
  const inkKey = `${checking ? "wait" : "ready"}|${section ?? ""}|${items.map((n) => n.key).join(",")}`;
  useLayoutEffect(() => {
    const ul = list.current;
    const bar = ink.current;
    if (!ul || !bar) return;
    const nav = ul.parentElement;
    const read = (): Ink | null => {
      const cur = ul.querySelector<HTMLElement>(".sx-nav__link[aria-current]");
      return cur ? { x: cur.offsetLeft + 10, w: Math.max(0, cur.offsetWidth - 20) } : null;
    };
    const put = (v: Ink) => {
      bar.style.setProperty("--ink-x", `${v.x}px`);
      bar.style.setProperty("--ink-w", `${v.w}px`);
    };
    const target = read();
    if (!target) {
      nav?.removeAttribute("data-ink");
      bar.setAttribute("data-off", "");
      return;
    }
    bar.removeAttribute("data-off");
    nav?.setAttribute("data-ink", "");
    const from = lastInk;
    if (from && !prefersReducedMotion() && (from.x !== target.x || from.w !== target.w)) {
      bar.setAttribute("data-still", "");
      put(from);
      bar.getBoundingClientRect();
      bar.removeAttribute("data-still");
    }
    put(target);
    lastInk = target;
    let frame = 0;
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            const next = read();
            if (!next) return;
            bar.setAttribute("data-still", "");
            put(next);
            lastInk = next;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => bar.removeAttribute("data-still"));
          });
    ro?.observe(ul);
    return () => {
      ro?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [inkKey]);
  const here = pathname.replace(/\/+$/, "") || "/";
  if (checking) {
    return (
      <div className="sx-nav" aria-hidden="true" data-loading="">
        <ul className="sx-nav__list">
          {SK_TABS.map((i) => (
            <li key={i} className="sx-nav__sk">
              <span className="sx-sk" />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (items.length < 2) return null;
  return (
    <nav className="sx-nav" aria-label={t("sx.nav.label")}>
      <ul ref={list} className="sx-nav__list scue-x">
        {items.map((n) => {
          const label = t(`sx.nav.${n.key}`);
          const current = section === n.key;
          const NavGlyph = NAV_ICON[n.key];
          return (
            <li key={n.key}>
              <Link
                href={n.href}
                className="sx-nav__link"
                aria-current={current ? (here === n.href ? "page" : "true") : undefined}
                data-ai-id={aiIdOf(base, "nav", n.key)}
                data-ai-type="tab"
                data-ai-label={label}
              >
                <NavGlyph size={16} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
        <li ref={ink} className="sx-nav__ink" role="presentation" aria-hidden="true" />
      </ul>
    </nav>
  );
}

function Crumbs({ crumbs, inline, base }: { crumbs: readonly SxCrumb[]; inline: boolean; base: string }) {
  const t = useTranslations("studio");
  const trail: SxCrumb[] = [{ label: t("sx.ui.studio"), href: ROOT_HREF }, ...crumbs];
  return (
    <nav className="sx-crumbs" aria-label={t("sx.nav.crumbs")} data-inline={inline || undefined}>
      <ol className="sx-crumbs__list">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={`${i}-${c.label}`} className="sx-crumbs__item">
              {c.href ? (
                <Link href={c.href} className="sx-crumbs__link" data-ai-id={aiIdOf(base, "crumb", i)} data-ai-type="link" data-ai-label={c.label}>
                  {c.label}
                </Link>
              ) : (
                <span className="sx-crumbs__text">{c.label}</span>
              )}
              {!last || inline ? glyph(ChevronRightIcon, { size: 12, className: "sx-crumbs__sep" }) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function NeonCrumbs({ crumbs, here, base }: { crumbs: readonly SxCrumb[]; here: string; base: string }) {
  const t = useTranslations("studio");
  const trail: SxCrumb[] = [{ label: t("sx.ui.studio"), href: ROOT_HREF }, ...crumbs];
  return (
    <nav className="sx-crumbs sx-rh__crumbs" aria-label={t("sx.nav.crumbs")}>
      <ol className="sx-crumbs__list">
        {trail.map((c, i) => (
          <li key={`${i}-${c.label}`} className="sx-crumbs__item">
            {c.href ? (
              <Link href={c.href} className="sx-crumbs__link" data-ai-id={aiIdOf(base, "crumb", i)} data-ai-type="link" data-ai-label={c.label}>
                {i === 0 ? glyph(HouseIcon, { size: 16, className: "sx-rh__home" }) : null}
                <span>{c.label}</span>
              </Link>
            ) : (
              <span className="sx-crumbs__text">{c.label}</span>
            )}
            {glyph(ChevronRightIcon, { size: 14, className: "sx-crumbs__sep" })}
          </li>
        ))}
        {here ? (
          <li className="sx-crumbs__item sx-rh__here">
            <span className="sx-crumbs__text" aria-current="page">
              {here}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

function BackLink({ crumbs, base }: { crumbs: readonly SxCrumb[]; base: string }) {
  const t = useTranslations("studio");
  const target = [...crumbs].reverse().find((c) => c.href) ?? { label: t("sx.ui.studio"), href: ROOT_HREF };
  return (
    <Link
      href={target.href ?? ROOT_HREF}
      className="sx-back"
      aria-label={t("sx.nav.backTo", { name: target.label })}
      data-ai-id={aiIdOf(base, "back")}
      data-ai-type="link"
      data-ai-label={target.label}
    >
      {glyph(ArrowLeftIcon, { size: 16 })}
      <span className="sx-back__text">{target.label}</span>
    </Link>
  );
}

function Title({ title, record }: { title: string; record: boolean }) {
  const t = useTranslations("studio");
  if (!title) {
    return (
      <h1 className="sx-title" aria-busy="true">
        <span className="sx-sk sx-title__sk" aria-hidden="true" />
        <span className="sx-vh">{t("sx.ui.loading")}</span>
      </h1>
    );
  }
  return (
    <h1 className="sx-title" title={record ? title : undefined}>
      {title}
    </h1>
  );
}

function Skeleton({ record }: { record: boolean }) {
  const t = useTranslations("studio");
  return (
    <div className="sx-page__sk" role="status" aria-busy="true" data-record={record || undefined}>
      <span className="sx-vh">{t("sx.ui.loading")}</span>
      <span className="sx-sk sx-page__sk-strip" aria-hidden="true" />
      <span className="sx-sk sx-page__sk-block" aria-hidden="true" />
    </div>
  );
}

function Gate({ gate, acc }: { gate: Exclude<SxGate, "open" | "checking">; acc: StudioAccess }) {
  const t = useTranslations("studio");
  if (gate === "off") {
    return (
      <SxEmpty
        icon={LayersIcon}
        title={t("sx.gate.offTitle")}
        text={t("sx.gate.offText")}
        action={
          <SxButton variant="secondary" icon={RefreshCwIcon} onClick={() => void recheckStudio()} aiId="admin.studio.gate.recheck">
            {t("sx.gate.offAction")}
          </SxButton>
        }
      />
    );
  }
  if (gate === "error") {
    return (
      <SxNote
        tone="error"
        title={t("sx.ui.errorTitle")}
        action={
          <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => void acc.reload()} aiId="admin.studio.gate.retry">
            {t("sx.ui.retry")}
          </SxButton>
        }
      >
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  }
  return <SxEmpty icon={LockIcon} title={t("sx.gate.deniedTitle")} text={t("sx.gate.deniedText")} />;
}

export function SxPage({
  title,
  layout = "page",
  look,
  icon,
  section = null,
  crumbs,
  lead,
  status,
  statusWhenStuck,
  meta,
  actions,
  below,
  need = "any",
  aiId,
  children,
}: SxPageProps): ReactElement {
  const acc = useStudioAccess();
  const gate = gateOf(acc, need);
  const open = gate === "open";
  const record = layout === "record";
  const base = aiId ?? "admin.studio";
  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const belowBox = useRef<HTMLDivElement>(null);
  const hasBelow = open && !!below;

  useEffect(() => {
    const page = root.current;
    const bar = head.current;
    if (!record || !page || !bar) return;
    const scroller = scrollParent(page);
    let io: IntersectionObserver | null = null;
    let last = -1;
    const watch = (h: number) => {
      io?.disconnect();
      io = null;
      const box = belowBox.current;
      if (!box || typeof IntersectionObserver === "undefined") {
        page.removeAttribute("data-stuck");
        return;
      }
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          const top = (entry.rootBounds?.top ?? 0) + h;
          page.toggleAttribute("data-stuck", !entry.isIntersecting && entry.boundingClientRect.top < top);
        },
        { root: scroller, rootMargin: `-${h}px 0px 0px 0px`, threshold: 0 },
      );
      io.observe(box);
    };
    const measure = () => {
      const h = Math.round(bar.getBoundingClientRect().height);
      if (h === last) return;
      last = h;
      page.style.setProperty("--sx-head-h", `${h}px`);
      watch(h);
    };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(bar);
    measure();
    return () => {
      ro?.disconnect();
      io?.disconnect();
      page.removeAttribute("data-stuck");
      page.style.removeProperty("--sx-head-h");
    };
  }, [record, hasBelow]);

  const body = gate === "checking" ? <Skeleton record={record} /> : gate === "open" ? children : <Gate gate={gate} acc={acc} />;

  if (record && look === "neon") {
    return (
      <SxIconScope>
        <div ref={root} className="sx sx-page" data-layout="record" data-look="neon" data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? title : undefined}>
          <div ref={head} className="sx-head sx-rh" data-sticky="">
            <div className="sx-head__row sx-rh__row">
              <div className="sx-head__main sx-rh__main">
                {crumbs ? <NeonCrumbs crumbs={crumbs} here={title} base={base} /> : null}
                {crumbs ? <BackLink crumbs={crumbs} base={base} /> : null}
                <Title title={title} record />
              </div>
              {open && (meta || statusWhenStuck || actions) ? (
                <div className="sx-head__side sx-rh__side">
                  {statusWhenStuck ? (
                    <div className="sx-head__stuck" data-always={below ? undefined : ""}>
                      {statusWhenStuck}
                    </div>
                  ) : null}
                  {meta ? <div className="sx-head__meta">{meta}</div> : null}
                  {actions ? <div className="sx-head__actions">{actions}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
          {hasBelow ? (
            <div ref={belowBox} className="sx-page__below">
              {below}
            </div>
          ) : null}
          <div className="sx-page__body">{body}</div>
        </div>
      </SxIconScope>
    );
  }

  if (record) {
    return (
      <SxIconScope>
        <div ref={root} className="sx sx-page" data-layout="record" data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? title : undefined}>
          <div ref={head} className="sx-head" data-sticky="">
            <div className="sx-head__row">
              <div className="sx-head__main">
                {crumbs ? <Crumbs crumbs={crumbs} inline base={base} /> : null}
                {crumbs ? <BackLink crumbs={crumbs} base={base} /> : null}
                <Title title={title} record />
              </div>
              {open && (meta || statusWhenStuck || actions) ? (
                <div className="sx-head__side">
                  {statusWhenStuck ? (
                    <div className="sx-head__stuck" data-always={below ? undefined : ""}>
                      {statusWhenStuck}
                    </div>
                  ) : null}
                  {meta ? <div className="sx-head__meta">{meta}</div> : null}
                  {actions ? <div className="sx-head__actions">{actions}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
          {hasBelow ? (
            <div ref={belowBox} className="sx-page__below">
              {below}
            </div>
          ) : null}
          <div className="sx-page__body">{body}</div>
        </div>
      </SxIconScope>
    );
  }

  return (
    <SxIconScope>
      <div ref={root} className="sx sx-page" data-layout="page" data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? title : undefined}>
        <StudioNav section={section} acc={acc} checking={gate === "checking"} base={base} />
        {crumbs ? <Crumbs crumbs={crumbs} inline={false} base={base} /> : null}
        <div ref={head} className="sx-head">
          <div className="sx-head__row">
            {icon ? (
              <span className="sx-head__icon" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <Title title={title} record={false} />
            {open && status ? <div className="sx-head__status">{status}</div> : null}
            {open && actions ? <div className="sx-head__actions">{actions}</div> : null}
          </div>
          {lead ? <div className="sx-lead">{lead}</div> : null}
        </div>
        {hasBelow ? (
          <div ref={belowBox} className="sx-page__below">
            {below}
          </div>
        ) : null}
        <div className="sx-page__body">{body}</div>
      </div>
    </SxIconScope>
  );
}
