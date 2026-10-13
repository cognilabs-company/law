"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import LineChart from "@/components/admin/LineChart";
import { IconArrowRight, IconInfo } from "@/components/icons";

// Drill-down content behind a stat tile: the headline number plus one or
// more breakdown sections built from the dashboard payload itself.
export type DrillRow = {
  label: string;
  value: string; // already formatted
  short?: string;
  n?: number; // raw number for bar widths / shares
  sub?: string;
  title?: string;
  tone?: "ok" | "bad" | "muted";
  href?: string;
};
export type DrillTableRow = { cells: string[]; tone?: "muted" };
export type DrillSection =
  | { kind: "bars"; title?: string; rows: DrillRow[]; empty?: string; limit?: number; moreLabel?: string; lessLabel?: string }
  | { kind: "list"; title?: string; rows: DrillRow[]; empty?: string }
  | { kind: "kv"; title?: string; rows: DrillRow[] }
  | { kind: "series"; title?: string; points: { label: string; value: number }[]; format?: (n: number) => string; empty?: string; controls?: boolean }
  | { kind: "steps"; title?: string; rows: DrillRow[]; empty?: string }
  | { kind: "table"; title?: string; caption?: string; head: { label: string; num?: boolean }[]; lines: DrillTableRow[]; empty?: string }
  | { kind: "note"; title?: string; text: string };
export type Drill = {
  title: string;
  value?: string;
  sub?: string;
  caption?: string;
  demo?: boolean;
  note?: string; // e.g. "backend kutilmoqda" / filter caveat
  link?: { href: string; label: string; primary?: boolean };
  closeLabel?: string;
  variant?: "report";
  sections: DrillSection[];
};

export default function StatDrillModal({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  const t = useTranslations("admin.dash");
  const link = drill?.link;
  const footer =
    link || drill?.closeLabel ? (
      <>
        {drill?.closeLabel ? (
          <button type="button" className="btn btn--line" onClick={onClose}>
            {drill.closeLabel}
          </button>
        ) : null}
        {link ? (
          <Link href={link.href} className={`btn ${link.primary ? "btn--pri" : "btn--soft"}`}>
            {link.label}
            <IconArrowRight />
          </Link>
        ) : null}
      </>
    ) : undefined;
  return (
    <Modal open={!!drill} onClose={onClose} title={drill?.title ?? ""} size="lg" footer={footer}>
      {drill ? (
        <div className={`drill${drill.variant === "report" ? " drill--report" : ""}`}>
          {drill.value || drill.demo ? (
            <div className="drill__head">
              {drill.value ? <b className="drill__v">{drill.value}</b> : null}
              {drill.value && drill.sub ? <span className="advmuted">{drill.sub}</span> : null}
              {drill.demo ? <em className="stile__demo stile__demo--static">{t("demo.badge")}</em> : null}
              {drill.value && drill.caption ? <span className="drill__cap">{drill.caption}</span> : null}
            </div>
          ) : null}
          {drill.note ? <p className="drill__note">{drill.note}</p> : null}
          {drill.sections.map((s, i) => (
            <Section key={`${drill.title}:${i}`} s={s} empty={t("drill.empty")} more={t("drill.total")} />
          ))}
        </div>
      ) : null}
    </Modal>
  );
}

function Section({ s, empty, more }: { s: DrillSection; empty: string; more: string }) {
  const [all, setAll] = useState(false);
  const title = s.title ? <h4 className="drill__t">{s.title}</h4> : null;
  if (s.kind === "note") {
    return (
      <div className="drill__sec">
        {title}
        <p className="drill__info">
          <IconInfo aria-hidden="true" />
          {s.text}
        </p>
      </div>
    );
  }
  if (s.kind === "series") {
    return (
      <div className="drill__sec">
        {title}
        {s.points.length ? <LineChart points={s.points} format={s.format} controls={s.controls ?? true} /> : <p className="advmuted">{s.empty ?? empty}</p>}
      </div>
    );
  }
  if (s.kind === "table") {
    return (
      <div className="drill__sec">
        {title}
        {s.lines.length ? (
          <table className="drill__table">
            {s.caption ? <caption className="sr-only">{s.caption}</caption> : null}
            <thead>
              <tr>
                {s.head.map((h, i) => (
                  <th key={i} scope="col" className={h.num ? "is-num" : undefined}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.lines.map((r, i) => (
                <tr key={i} className={r.tone === "muted" ? "is-muted" : undefined}>
                  {r.cells.map((c, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">
                        {c}
                      </th>
                    ) : (
                      <td key={j} className={s.head[j]?.num ? "is-num" : undefined}>
                        {c}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="advmuted">{s.empty ?? empty}</p>
        )}
      </div>
    );
  }
  if (s.kind === "kv") {
    return (
      <div className="drill__sec">
        {title}
        <div className="pkv">
          {s.rows.map((r, i) => (
            <div className="pkv__i" key={i}>
              <label>{r.label}</label>
              <b className={r.tone ? `drill__${r.tone}` : undefined}>{r.value}</b>
              {r.sub ? <span className="advmuted" style={{ display: "block", fontSize: ".76rem" }}>{r.sub}</span> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!s.rows.length) {
    return (
      <div className="drill__sec">
        {title}
        <p className="advmuted">{s.empty ?? empty}</p>
      </div>
    );
  }
  if (s.kind === "steps") {
    const top = Math.max(1, ...s.rows.map((r) => r.n ?? 0));
    return (
      <div className="drill__sec">
        {title}
        <ol className="drill__steps">
          {s.rows.map((r, i) => (
            <li key={i}>
              <span className="drill__step-l">{r.label}</span>
              <b className="drill__step-v">{r.value}</b>
              <span className="drill__step-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.max(2, ((r.n ?? 0) / top) * 100))}%` }} />
              </span>
              {r.sub ? <small className="drill__step-s">{r.sub}</small> : null}
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (s.kind === "bars") {
    const max = Math.max(1, ...s.rows.map((r) => r.n ?? 0));
    const total = s.rows.reduce((a, r) => a + (r.n ?? 0), 0);
    const capped = s.limit != null && s.rows.length > s.limit;
    const shown = capped && !all ? s.rows.slice(0, s.limit) : s.rows;
    return (
      <div className="drill__sec">
        {title}
        <div className="kfunnel">
          {shown.map((r, i) => {
            const fill = (r.n ?? 0) > 0 ? Math.max(2, ((r.n ?? 0) / max) * 100) : 0;
            return (
              <div className={`kfunnel__row${r.short ? " kfunnel__row--short" : ""}${r.tone === "muted" ? " kfunnel__row--muted" : ""}`} key={i}>
                <span className="kfunnel__lbl" title={r.title}>
                  {r.label}
                  {r.sub ? <small className="kfunnel__sub">{r.sub}</small> : null}
                </span>
                <span className="kfunnel__bar">{fill ? <span style={{ width: `${Math.min(100, fill)}%` }} /> : null}</span>
                <b className="kfunnel__v">
                  <span className="kfunnel__full">{r.value}</span>
                  {r.short ? <span className="kfunnel__short">{r.short}</span> : null}
                  {total > 0 && r.n != null ? <small className="drill__pct">{Math.round((r.n / total) * 100)}%</small> : null}
                </b>
              </div>
            );
          })}
        </div>
        {capped ? (
          <button type="button" className="btn btn--line btn--sm drill__more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? (s.lessLabel ?? more) : (s.moreLabel ?? `${more} (${s.rows.length})`)}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="drill__sec">
      {title}
      <div className="alist">
        {s.rows.map((r, i) => {
          const inner = (
            <>
              <div className="aitem__m">
                <b>{r.label}</b>
                {r.sub ? <span className="aitem__meta">{r.sub}</span> : null}
              </div>
              {r.value ? <span className={`creq__badge${r.tone === "ok" ? " creq__badge--ok" : ""}`}>{r.value}</span> : null}
            </>
          );
          return r.href ? (
            <Link href={r.href} className="aitem aitem--link" key={i}>{inner}</Link>
          ) : (
            <div className="aitem" key={i}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
