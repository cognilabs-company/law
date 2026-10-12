"use client";

import { useLocale } from "next-intl";
import { useAuth, hasAdminAccess } from "@/lib/auth";
import { hasInternalAccess } from "@/lib/services/internalHrm";
import { MASK, type StudioConstructor, type StudioExperience, type StudioPreviewItem, type StudioRisk, type StudioSurface, type StudioVisualPreview } from "@/lib/services/studio";
import { IconAlert, IconCheck, IconCircleCheck, IconExternal, IconInfo, IconLock, IconMapPin, IconShieldCheck } from "@/components/icons";
import { useStudioText } from "./bits";

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
  const { t } = useStudioText();
  const link = useSurfaceLink();
  if (!surfaces.length) return null;
  return (
    <ul className={`stu-where${compact ? " is-compact" : ""}`}>
      {surfaces.map((s) => {
        const href = link(s.route);
        return (
          <li key={`${s.key}-${s.route}`}>
            <span className="stu-where__i" aria-hidden>
              <IconMapPin />
            </span>
            <span className="stu-where__t">
              <b>{s.title}</b>
              {s.placement ? <small>{s.placement}</small> : null}
              {compact ? null : <code title={t("ux.surfaceKey")}>{s.key}</code>}
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
  const { t, ctorName } = useStudioText();
  const x: StudioExperience = ctor.experience;
  const nav = ctor.navigation;
  return (
    <section className="stu-guide" aria-label={t("ux.whatTitle")}>
      {x.risk === "high" || x.warnings.length ? (
        <div className={`stu-guide__warn stu-guide__warn--${x.risk}`} role={x.risk === "high" ? "alert" : "note"}>
          <IconAlert aria-hidden />
          <div>
            <b>{x.risk === "high" ? t("ux.highTitle") : t("ux.warnTitle")}</b>
            <ul>
              {x.warnings.map((w) => (
                <li key={w}>{w}</li>
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
          <p className="stu-guide__lead">{x.plainLanguage}</p>
          <dl>
            {x.whenToUse ? (
              <>
                <dt>{t("ux.when")}</dt>
                <dd>{x.whenToUse}</dd>
              </>
            ) : null}
            {x.result ? (
              <>
                <dt>{t("ux.result")}</dt>
                <dd>{x.result}</dd>
              </>
            ) : null}
            {x.managedBy.length ? (
              <>
                <dt>{t("ux.managedBy")}</dt>
                <dd className="stu-guide__chips">
                  {x.managedBy.map((m) => (
                    <span key={m}>{m.replace(/_/g, " ")}</span>
                  ))}
                </dd>
              </>
            ) : null}
            <dt>{t("ux.approval")}</dt>
            <dd>{ctor.approvalRequired ? <span className="stu-guide__appr"><IconShieldCheck aria-hidden />{t("ux.approvalYes")}</span> : t("ux.approvalNo")}</dd>
          </dl>
          {x.notes.length ? (
            <ul className="stu-guide__notes">
              {x.notes.map((n) => (
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
            {nav && nav.steps ? <span className="stu-guide__step">{t("ux.stepOf", { n: nav.step, of: nav.steps, group: nav.groupTitle })}</span> : null}
          </header>
          {x.workflow.length ? (
            <ol className="stu-flow">
              {x.workflow.map((w) => (
                <li key={w.step}>
                  <span className="stu-flow__n">{w.step}</span>
                  <span className="stu-flow__t">
                    <b>{w.title}</b>
                    {w.description ? <small>{w.description}</small> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
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
  if (!items.length) return null;
  return (
    <ul className="stu-check-list">
      {items.map((c) => (
        <li key={c}>
          <IconCheck aria-hidden />
          {c}
        </li>
      ))}
    </ul>
  );
}

// ── Preview renderers ───────────────────────────────────────────────────────

// A value as text, never more than it says: a masked value is the mask and
// nothing else (no tooltip, no copy, never logged).
export function previewText(item: StudioPreviewItem, yes: string, no: string): string {
  if (item.masked || item.value === MASK) return MASK;
  const v = item.value;
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? yes : no;
  if (typeof v === "number" || typeof v === "string") return String(v);
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? Object.values(x as Record<string, unknown>).filter((y) => typeof y === "string" || typeof y === "number").slice(0, 2).join(" · ") : String(x))).join(", ");
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${typeof x === "object" ? "…" : String(x)}`).join(" · ");
  return String(v);
}

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const nameOf = (x: unknown): string => {
  if (x && typeof x === "object") {
    const d = x as Record<string, unknown>;
    for (const k of ["title", "name", "label", "key", "code", "status", "value"]) if (typeof d[k] === "string" && d[k]) return d[k] as string;
    return Object.values(d).find((y) => typeof y === "string") as string ?? "—";
  }
  return x === null || x === undefined ? "—" : String(x);
};

export function PreviewView({ visual }: { visual: StudioVisualPreview }) {
  const { t } = useStudioText();
  const text = (i: StudioPreviewItem) => previewText(i, t("ux.yes"), t("ux.no"));
  const items = visual.items;
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
            <h4>{title ? text(title) : visual.title}</h4>
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
            <b>{title ? text(title) : visual.title}</b>
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
          <div className="stu-pv__bubble">{body ? text(body) : visual.description || visual.title}</div>
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
                <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>{cols.map((c) => <td key={c}>{nameOf((r as Record<string, unknown>)[c])}</td>)}</tr>
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
                  {roles.slice(0, 5).map((r) => <th key={r}>{r}</th>)}
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
