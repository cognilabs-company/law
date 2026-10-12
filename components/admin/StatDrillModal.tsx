"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import LineChart from "@/components/admin/LineChart";
import { IconArrowRight } from "@/components/icons";

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
export type DrillSection =
  | { kind: "bars"; title?: string; rows: DrillRow[]; empty?: string }
  | { kind: "list"; title?: string; rows: DrillRow[]; empty?: string }
  | { kind: "kv"; title?: string; rows: DrillRow[] }
  | { kind: "series"; title?: string; points: { label: string; value: number }[]; format?: (n: number) => string; empty?: string; controls?: boolean };
export type Drill = {
  title: string;
  value?: string;
  sub?: string;
  demo?: boolean;
  note?: string; // e.g. "backend kutilmoqda" / filter caveat
  link?: { href: string; label: string };
  sections: DrillSection[];
};

export default function StatDrillModal({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  const t = useTranslations("admin.dash");
  return (
    <Modal
      open={!!drill}
      onClose={onClose}
      title={drill?.title ?? ""}
      size="lg"
      footer={
        drill?.link ? (
          <Link href={drill.link.href} className="btn btn--soft">
            {drill.link.label}
            <IconArrowRight />
          </Link>
        ) : undefined
      }
    >
      {drill ? (
        <div className="drill">
          {drill.value ? (
            <div className="drill__head">
              <b className="drill__v">{drill.value}</b>
              {drill.sub ? <span className="advmuted">{drill.sub}</span> : null}
              {drill.demo ? <em className="stile__demo stile__demo--static">{t("demo.badge")}</em> : null}
            </div>
          ) : null}
          {drill.note ? <p className="drill__note">{drill.note}</p> : null}
          {drill.sections.map((s, i) => (
            <Section key={i} s={s} empty={t("drill.empty")} />
          ))}
        </div>
      ) : null}
    </Modal>
  );
}

function Section({ s, empty }: { s: DrillSection; empty: string }) {
  const title = s.title ? <h4 className="drill__t">{s.title}</h4> : null;
  if (s.kind === "series") {
    return (
      <div className="drill__sec">
        {title}
        {s.points.length ? <LineChart points={s.points} format={s.format} controls={s.controls ?? true} /> : <p className="advmuted">{s.empty ?? empty}</p>}
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
  if (s.kind === "bars") {
    const max = Math.max(1, ...s.rows.map((r) => r.n ?? 0));
    const total = s.rows.reduce((a, r) => a + (r.n ?? 0), 0);
    return (
      <div className="drill__sec">
        {title}
        <div className="kfunnel">
          {s.rows.map((r, i) => {
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
