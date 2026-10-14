"use client";

import { useLocale } from "next-intl";
import { useAuth, hasAdminAccess } from "@/lib/auth";
import { hasInternalAccess } from "@/lib/services/internalHrm";
import { type StudioConstructor, type StudioExperience, type StudioRisk, type StudioSurface } from "@/lib/services/studio";
import { IconAlert, IconCheck, IconCircleCheck, IconExternal, IconInfo, IconLock, IconMapPin, IconShieldCheck } from "@/components/icons";
import { useStudioText } from "./bits";
import { useStudioHuman } from "./human";

// What a constructor is for, shown from the backend's own words (spec 10-12
// UX metadata): nothing here knows any one constructor — purpose, places,
// steps, notes, risk and the preview all come with the constructor.

export function RiskBadge({ risk, compact }: { risk: StudioRisk; compact?: boolean }) {
  const { t } = useStudioText();
  return (
    <span className={`stu-risk stu-risk--${risk}${compact ? " is-compact" : ""}`} title={t(`ux.riskHint.${risk}`)}>
      {risk === "high" ? <IconAlert aria-hidden /> : risk === "medium" ? <IconInfo aria-hidden /> : <IconCircleCheck aria-hidden />}
      {t(`ux.risk.${risk}`)}
    </span>
  );
}

// A page the result shows on: its link opens only for someone who may open
// that page; the locale the route was written with becomes the reader's.
export function useSurfaceLink() {
  const locale = useLocale();
  const { session } = useAuth();
  return (route: string): string | null => {
    if (!route || !route.startsWith("/")) return null;
    const path = route.replace(/^\/(uz|ru|en)(?=\/|$)/, "") || "/";
    let allowed = true;
    if (path.startsWith("/admin")) allowed = hasAdminAccess(session);
    else if (path.startsWith("/internal")) allowed = hasInternalAccess(session);
    else if (path.startsWith("/portal")) allowed = !!session;
    return allowed ? `/${locale}${path === "/" ? "" : path}` : null;
  };
}

export function SurfaceList({ surfaces, compact }: { surfaces: StudioSurface[]; compact?: boolean }) {
  const { t, surface } = useStudioHuman();
  const link = useSurfaceLink();
  if (!surfaces.length) return null;
  // Several settings may land on one page: it is named once.
  const seen = new Set<string>();
  const rows = surfaces.map((s) => ({ s, w: surface(s) })).filter(({ s, w }) => (seen.has(`${w.title}|${w.what}|${s.route}`) ? false : (seen.add(`${w.title}|${w.what}|${s.route}`), true)));
  return (
    <ul className={`stu-where${compact ? " is-compact" : ""}`}>
      {rows.map(({ s, w }) => {
        const href = link(s.route);
        return (
          <li key={`${s.key}-${s.route}`}>
            <span className="stu-where__i" aria-hidden>
              <IconMapPin />
            </span>
            <span className="stu-where__t">
              <b>{w.title}</b>
              {w.what ? <small>{w.what}</small> : null}
            </span>
            {compact ? null : href ? (
              <a className="stu-where__go" href={href} target="_blank" rel="noopener noreferrer" title={t("ux.openPage")}>
                <IconExternal aria-hidden />
                <span>{t("ux.openPage")}</span>
              </a>
            ) : s.route ? (
              <span className="stu-where__lock" title={t("ux.noAccess")}>
                <IconLock aria-hidden />
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// The editor's opening: what it does, where it shows, the order to work in.
export function ConstructorGuide({ ctor }: { ctor: StudioConstructor }) {
  const hm = useStudioHuman();
  const { t, ctorName } = hm;
  const x: StudioExperience = ctor.experience;
  const nav = ctor.navigation;
  const steps = hm.steps(ctor);
  const notes = ["n1", "n2", "n3", "n4"].map((id) => hm.h(`note.${id}`));
  return (
    <section className="stu-guide" aria-label={t("ux.whatTitle")}>
      {x.risk === "high" || x.warnings.length ? (
        <div className={`stu-guide__warn stu-guide__warn--${x.risk}`} role={x.risk === "high" ? "alert" : "note"}>
          <IconAlert aria-hidden />
          <div>
            <b>{x.risk === "high" ? t("ux.highTitle") : t("ux.warnTitle")}</b>
            <ul>
              {x.warnings.map((w) => (
                <li key={w}>{hm.warn(w)}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <div className="stu-guide__grid">
        <article className="stu-guide__card stu-guide__card--what">
          <header>
            <h3>{t("ux.whatTitle")}</h3>
            <RiskBadge risk={x.risk} />
          </header>
          <p className="stu-guide__lead">{hm.what(ctor)}</p>
          <dl>
            <dt>{t("ux.when")}</dt>
            <dd>{hm.whenToUse(ctor)}</dd>
            <dt>{t("ux.result")}</dt>
            <dd>{hm.result(ctor)}</dd>
            {x.managedBy.length ? (
              <>
                <dt>{t("ux.managedBy")}</dt>
                <dd className="stu-guide__chips">
                  {x.managedBy.map((m) => (
                    <span key={m}>{hm.role(m)}</span>
                  ))}
                </dd>
              </>
            ) : null}
            <dt>{t("ux.approval")}</dt>
            <dd>{ctor.approvalRequired ? <span className="stu-guide__appr"><IconShieldCheck aria-hidden />{t("ux.approvalYes")}</span> : t("ux.approvalNo")}</dd>
          </dl>
          {notes.length ? (
            <ul className="stu-guide__notes">
              {notes.map((n) => (
                <li key={n}>
                  <IconInfo aria-hidden />
                  {n}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
        <article className="stu-guide__card">
          <header>
            <h3>{t("ux.whereTitle")}</h3>
          </header>
          {x.whereUsed.length ? <SurfaceList surfaces={x.whereUsed} /> : <p className="stu-hint">{t("ux.whereNone")}</p>}
        </article>
        <article className="stu-guide__card">
          <header>
            <h3>{t("ux.howTitle")}</h3>
            {nav && nav.steps ? <span className="stu-guide__step">{t("ux.stepOf", { n: nav.step, of: nav.steps, group: hm.groupTitle(nav.groupKey, nav.groupTitle) })}</span> : null}
          </header>
          <ol className="stu-flow">
            {steps.map((w, i) => (
              <li key={w.title}>
                <span className="stu-flow__n">{i + 1}</span>
                <span className="stu-flow__t">
                  <b>{w.title}</b>
                  {w.text ? <small>{w.text}</small> : null}
                </span>
              </li>
            ))}
          </ol>
          {nav && (nav.requiredBefore.length || nav.recommendedBefore.length || nav.nextSteps.length) ? (
            <div className="stu-guide__seq">
              {nav.requiredBefore.length ? <p><b>{t("ux.requiredBefore")}</b> {nav.requiredBefore.map((c) => ctorName(c)).join(", ")}</p> : null}
              {nav.recommendedBefore.length ? <p><b>{t("ux.recommendedBefore")}</b> {nav.recommendedBefore.map((c) => ctorName(c)).join(", ")}</p> : null}
              {nav.nextSteps.length ? <p><b>{t("ux.nextSteps")}</b> {nav.nextSteps.map((c) => ctorName(c)).join(", ")}</p> : null}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

export function ChecklistList({ items }: { items: string[] }) {
  const { check } = useStudioHuman();
  if (!items.length) return null;
  return (
    <ul className="stu-check-list">
      {items.map((c) => (
        <li key={c}>
          <IconCheck aria-hidden />
          {check(c)}
        </li>
      ))}
    </ul>
  );
}
