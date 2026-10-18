"use client";

import "../sx-core.css";
import "../sx-layout.css";
import { useEffect, useId, useState, type ReactElement, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import IconButton from "@/components/ui/IconButton";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { hasAdminAccess, useAuth } from "@/lib/auth";
import { hasInternalAccess } from "@/lib/services/internalHrm";
import { getEffectiveRoute, getStudioConstructorDetail, studioDetailSnapshot, useStudioRegistry, type StudioConstructor, type StudioRoute } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { ArrowRightIcon, ExternalLinkIcon, RefreshCwIcon, CheckIcon, InfoIcon, LockIcon, TriangleAlertIcon, ctorGlyph, glyph } from "../icons";
import { useStudioLabels } from "../useStudioLabels";
import { SxDrawer } from "./Drawer";
import { buildGuide, guideRouteOf } from "./guideModel";
import { SxNote } from "./Note";
import { SxSectionHeader } from "./Panel";

export type SxGuideProps = { code: string; open: boolean; onClose: () => void };
export type SxGuideButtonProps = { code: string; label?: string; aiId?: string };

type GuideLoad = { key: string; ctor: StudioConstructor | null; route: StudioRoute | null };

const SK_LINES = [0, 1, 2, 3, 4, 5];

function seg(code: string): string {
  return code.trim().toLowerCase();
}

function usePageLink(): (route: string) => string | null {
  const locale = useLocale();
  const { session } = useAuth();
  return (route: string) => {
    if (!route || !route.startsWith("/")) return null;
    const path = route.replace(/^\/(uz|ru|en)(?=\/|$)/, "") || "/";
    let ok = true;
    if (path.startsWith("/admin")) ok = hasAdminAccess(session);
    else if (path.startsWith("/internal")) ok = hasInternalAccess(session);
    else if (path.startsWith("/portal")) ok = !!session;
    return ok ? `/${locale}${path === "/" ? "" : path}` : null;
  };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="sx-guide__sec" aria-labelledby={id}>
      <SxSectionHeader as="h3" id={id} title={title} />
      {children}
    </section>
  );
}

function GuideSkeleton() {
  const t = useTranslations("studio");
  return (
    <div className="sx-guide__sk" role="status" aria-busy="true">
      <span className="sx-vh">{t("sx.ui.loading")}</span>
      {SK_LINES.map((i) => (
        <span key={i} className="sx-sk sx-guide__skline" data-i={i} aria-hidden="true" />
      ))}
    </div>
  );
}

export function SxGuideBody({ code }: { code: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const registry = useStudioRegistry();
  const linkFor = usePageLink();
  const uid = useId();
  const [attempt, setAttempt] = useState(0);
  const want = `${code}#${attempt}`;
  const [load, setLoad] = useState<GuideLoad>({ key: "", ctor: null, route: null });

  useEffect(() => {
    const ac = new AbortController();
    const fresh = studioDetailSnapshot(code) ? getEffectiveRoute(code, ac.signal).then((r) => ({ r }), () => null) : Promise.resolve(null);
    void Promise.all([getStudioConstructorDetail(code), fresh]).then(([ctor, latest]) => {
      if (ac.signal.aborted) return;
      setLoad({ key: want, ctor, route: latest ? latest.r : ctor ? guideRouteOf(ctor) : null });
    });
    return () => ac.abort();
  }, [code, want]);

  if (load.key !== want) return <GuideSkeleton />;
  if (!load.ctor) {
    return (
      <SxNote
        tone="error"
        title={t("sx.ui.loadFail")}
        action={
          <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => setAttempt((n) => n + 1)} aiId={aiIdOf("admin.studio.guide", seg(code), "retry")}>
            {t("sx.ui.retry")}
          </SxButton>
        }
      />
    );
  }

  const m = buildGuide(code, load.ctor, registry.items, load.route, labels, (key, values) => t(key, values));
  const ids = { what: `${uid}-what`, where: `${uid}-where`, how: `${uid}-how`, deps: `${uid}-deps`, approval: `${uid}-approval` };

  return (
    <div className="sx-guide">
      <Section id={ids.what} title={t("sx.guide.what")}>
        {m.what ? <p className="sx-guide__lead">{m.what}</p> : null}
        <p className="sx-guide__text">{m.result}</p>
      </Section>

      <Section id={ids.where} title={t("sx.guide.where")}>
        {m.places.length ? (
          <ul className="sx-guide__places">
            {m.places.map((p, i) => {
              const href = linkFor(p.route);
              const titleId = `${uid}-place-${i}`;
              return (
                <li key={p.key} className="sx-guide__place">
                  <div className="sx-guide__ptext">
                    <p id={titleId} className="sx-guide__ptitle">
                      {p.title}
                    </p>
                    {p.what ? <p className="sx-guide__pwhat">{p.what}</p> : null}
                  </div>
                  {href ? (
                    <a
                      className="sx-link sx-guide__open"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-describedby={titleId}
                      data-ai-id={aiIdOf("admin.studio.guide", seg(code), "open-page", i)}
                      data-ai-type="link"
                      data-ai-label={`${t("sx.guide.openPage")}: ${p.title}`}
                    >
                      {glyph(ExternalLinkIcon, { size: 16 })}
                      <span>{t("sx.guide.openPage")}</span>
                    </a>
                  ) : p.route.startsWith("/") ? (
                    <span className="sx-guide__lock" title={t("sx.guide.noAccess")}>
                      {glyph(LockIcon, { size: 16 })}
                      <span className="sx-vh">{t("sx.guide.noAccess")}</span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="sx-guide__muted">{t("sx.guide.whereNone")}</p>
        )}
        {m.surfaces ? <p className="sx-guide__muted">{m.surfaces}</p> : null}
      </Section>

      <Section id={ids.how} title={t("sx.guide.how")}>
        <ol className="sx-guide__steps">
          {m.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Section>

      <Section id={ids.deps} title={t("sx.guide.deps")}>
        {m.position ? <p className="sx-guide__muted">{m.position}</p> : null}
        {m.blocked ? (
          <SxNote
            tone="warn"
            className="sx-guide__blocked"
            action={
              <SxLinkButton variant="secondary" size="sm" href={`/admin/studio/c/${encodeURIComponent(m.blocked.first.code)}`} iconEnd={ArrowRightIcon} aiId={aiIdOf("admin.studio.guide", seg(code), "blocked")}>
                {m.blocked.first.name}
              </SxLinkButton>
            }
          >
            {m.blocked.text}
          </SxNote>
        ) : null}
        {m.lists.map((l) => (
          <div key={l.kind} className="sx-guide__deps">
            <h4 className="sx-guide__dhead">{t(`sx.guide.${l.kind}`)}</h4>
            <ul className="sx-guide__dlist">
              {l.items.map((d) => (
                <li key={d.code}>
                  <Link href={`/admin/studio/c/${encodeURIComponent(d.code)}`} className="sx-guide__dep" data-ai-id={aiIdOf("admin.studio.guide", seg(code), "dep", seg(d.code))} data-ai-type="link" data-ai-label={d.name}>
                    {ctorGlyph(d.code, d.group || undefined, { size: 18, className: "sx-guide__dicon" })}
                    <span className="sx-guide__dname">{d.name}</span>
                    <code className="sx-code">{d.code}</code>
                    <span className="sx-guide__dstate" data-done={d.done || undefined}>
                      {d.done ? glyph(CheckIcon, { size: 14, strokeWidth: 2.5 }) : null}
                      {d.done ? t("sx.guide.done") : t("sx.guide.notDone")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {m.noDeps ? <p className="sx-guide__muted">{t("sx.guide.noDeps")}</p> : null}
      </Section>

      <Section id={ids.approval} title={t("sx.guide.approval")}>
        <p className="sx-guide__text">{m.approval}</p>
        {m.route.map((line) => (
          <p key={line} className="sx-guide__text">
            {line}
          </p>
        ))}
        {m.origin ? <p className="sx-guide__muted">{m.origin}</p> : null}
        <p className="sx-guide__muted">{m.risk}</p>
        {m.warnings.length ? (
          <ul className="sx-guide__warns">
            {m.warnings.map((w) => (
              <li key={w}>
                {glyph(TriangleAlertIcon, { size: 16, className: "sx-guide__wicon" })}
                <span>{w}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </div>
  );
}

export function SxGuide({ code, open, onClose }: SxGuideProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const registry = useStudioRegistry();
  const item = registry.items.find((c) => c.code === code);
  return (
    <SxDrawer
      open={open}
      onClose={onClose}
      title={t("sx.guide.title")}
      description={
        <span className="sx-guide__ctor">
          {ctorGlyph(code, item?.navigation?.groupKey, { size: 18 })}
          <span>{labels.ctorName(code, item?.title)}</span>
        </span>
      }
      aiId={aiIdOf("admin.studio.guide", seg(code))}
    >
      {open ? <SxGuideBody code={code} /> : null}
    </SxDrawer>
  );
}

export function SxGuideButton({ code, label, aiId }: SxGuideButtonProps): ReactElement {
  const t = useTranslations("studio");
  const [open, setOpen] = useState(false);
  const text = label ?? t("sx.guide.title");
  return (
    <>
      <IconButton
        className="sx-ibtn sx-guide__btn"
        size="sm"
        label={text}
        icon={glyph(InfoIcon)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        aiId={aiId ?? aiIdOf("admin.studio.guide", seg(code), "open")}
      />
      <SxGuide code={code} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
