"use client";

import { useLocale } from "next-intl";
import { useAuth, hasAdminAccess } from "@/lib/auth";
import { hasInternalAccess } from "@/lib/services/internalHrm";
import { MASK, type StudioConstructor, type StudioExperience, type StudioPreviewItem, type StudioRisk, type StudioSurface, type StudioVisualPreview } from "@/lib/services/studio";
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

// ── Preview renderers ───────────────────────────────────────────────────────

// What the preview shows is said in the reader's words (./human): a field
// by its name, a value as a person would say it; a masked value is the mask
// and nothing else (no tooltip, no copy, never logged).

export function PreviewView({ visual }: { visual: StudioVisualPreview }) {
  const hm = useStudioHuman();
  const { t } = hm;
  const text = (i: StudioPreviewItem) => (i.masked || i.value === MASK ? MASK : hm.value(i.value, i.key));
  const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const nameOf = (x: unknown): string => (x && typeof x === "object" ? hm.titleOf(x as Record<string, unknown>) || "—" : hm.value(x));
  // Every row is named from the dictionary, never by the backend's key.
  const items = visual.items.map((i) => ({ ...i, label: hm.fieldLabel(i.key, i.label) }));
  const firstList = items.find((i) => !i.masked && Array.isArray(i.value) && (i.value as unknown[]).length);
  const scalars = items.filter((i) => i.masked || !Array.isArray(i.value));
  const kv = (list: StudioPreviewItem[]) => (
    <dl className="stu-pv__kv">
      {list.map((i) => (
        <div key={i.key} className={i.masked ? "is-masked" : undefined}>
          <dt>{i.label}</dt>
          <dd>{i.masked ? <span className="stu-pv__mask"><IconLock aria-hidden />{MASK}</span> : text(i)}</dd>
        </div>
      ))}
    </dl>
  );
  switch (visual.type) {
    case "document": {
      const title = items.find((i) => /title|name|nomi/i.test(i.key)) ?? items[0];
      const rest = items.filter((i) => i !== title && !Array.isArray(i.value));
      const sections = items.filter((i) => Array.isArray(i.value));
      return (
        <div className="stu-pv stu-pv--doc">
          <div className="stu-pv__paper">
            <span className="stu-pv__fold" aria-hidden />
            <h4>{title ? text(title) : ""}</h4>
            {kv(rest.slice(0, 4))}
            {sections.map((s) => (
              <div key={s.key} className="stu-pv__docsec">
                <b>{s.label}</b>
                <ol>
                  {listOf(s.value).slice(0, 6).map((x, i) => (
                    <li key={i}>{nameOf(x)}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "kanban":
    case "workflow": {
      const cols = firstList ? listOf(firstList.value) : [];
      return (
        <div className={`stu-pv stu-pv--${visual.type}`}>
          {cols.length ? (
            visual.type === "kanban" ? (
              <div className="stu-pv__cols">
                {cols.slice(0, 8).map((c, i) => (
                  <div key={i} className="stu-pv__col">
                    <b>{nameOf(c)}</b>
                    <span className="stu-pv__ghost" />
                    <span className="stu-pv__ghost is-short" />
                  </div>
                ))}
              </div>
            ) : (
              <ol className="stu-pv__steps">
                {cols.slice(0, 10).map((c, i) => (
                  <li key={i}>
                    <span>{i + 1}</span>
                    <b>{nameOf(c)}</b>
                  </li>
                ))}
              </ol>
            )
          ) : null}
          {kv(scalars.slice(0, 8))}
        </div>
      );
    }
    case "marketplace_card": {
      const title = items.find((i) => /title|name/i.test(i.key)) ?? items[0];
      const price = items.find((i) => /price|narx|amount/i.test(i.key));
      const desc = items.find((i) => /desc|value|text|summary/i.test(i.key) && i !== title);
      const rest = items.filter((i) => i !== title && i !== price && i !== desc).slice(0, 5);
      return (
        <div className="stu-pv stu-pv--card">
          <div className="stu-pv__mcard">
            <span className="stu-pv__thumb" aria-hidden />
            <b>{title ? text(title) : "—"}</b>
            {desc ? <p>{text(desc)}</p> : null}
            {price ? <span className="stu-pv__price">{text(price)}</span> : null}
            <span className="stu-pv__tags">
              {rest.map((i) => (
                <span key={i.key} title={i.label}>{i.masked ? MASK : text(i)}</span>
              ))}
            </span>
          </div>
        </div>
      );
    }
    case "pricing":
      return (
        <div className="stu-pv stu-pv--pricing">
          <p className="stu-pv__note">{t("ux.pricingNote")}</p>
          <table className="stu-pv__table">
            <tbody>
              {items.map((i) => (
                <tr key={i.key}>
                  <th>{i.label}</th>
                  <td>{i.masked ? MASK : text(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "communication": {
      const channel = items.find((i) => /channel|kanal/i.test(i.key));
      const body = items.find((i) => /body|text|message|template/i.test(i.key));
      const rest = items.filter((i) => i !== channel && i !== body);
      return (
        <div className="stu-pv stu-pv--comm">
          {channel ? <span className="stu-pv__chan">{text(channel)}</span> : null}
          <div className="stu-pv__bubble">{body ? text(body) : "…"}</div>
          {kv(rest.slice(0, 8))}
        </div>
      );
    }
    case "dashboard":
      return (
        <div className="stu-pv stu-pv--dash">
          <div className="stu-pv__widgets">
            {(firstList ? listOf(firstList.value) : items).slice(0, 6).map((w, i) => (
              <div key={i} className="stu-pv__widget">
                <small>{firstList ? nameOf(w) : (w as StudioPreviewItem).label}</small>
                <b>{firstList ? "—" : text(w as StudioPreviewItem)}</b>
                <span className="stu-pv__spark" aria-hidden />
              </div>
            ))}
          </div>
          {firstList ? kv(scalars.slice(0, 6)) : null}
        </div>
      );
    case "table": {
      const rows = firstList ? listOf(firstList.value).slice(0, 8) : [];
      const cols = rows.length && rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0] as Record<string, unknown>).slice(0, 4) : [];
      return (
        <div className="stu-pv stu-pv--table">
          {rows.length && cols.length ? (
            <table className="stu-pv__table">
              <thead>
                <tr>{cols.map((c) => <th key={c}>{hm.fieldLabel(c)}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>{cols.map((c) => <td key={c}>{hm.value((r as Record<string, unknown>)[c], c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {kv(rows.length ? scalars.slice(0, 6) : items)}
        </div>
      );
    }
    case "security_matrix": {
      const roles = firstList ? listOf(firstList.value).map(nameOf) : [];
      const perms = scalars.filter((i) => !i.masked);
      return (
        <div className="stu-pv stu-pv--sec">
          {roles.length ? (
            <table className="stu-pv__table stu-pv__matrix">
              <thead>
                <tr>
                  <th />
                  {roles.slice(0, 5).map((r) => <th key={r}>{hm.role(r)}</th>)}
                </tr>
              </thead>
              <tbody>
                {perms.slice(0, 8).map((p) => (
                  <tr key={p.key}>
                    <th>{p.label}</th>
                    {roles.slice(0, 5).map((r) => <td key={r}>{p.value ? <IconCheck aria-label={t("ux.yes")} /> : "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            kv(items)
          )}
        </div>
      );
    }
    case "integration":
      return (
        <div className="stu-pv stu-pv--int">
          {kv(items)}
          <p className="stu-pv__note"><IconLock aria-hidden />{t("ux.secretsNote")}</p>
        </div>
      );
    default:
      return <div className="stu-pv stu-pv--summary">{kv(items)}</div>;
  }
}
