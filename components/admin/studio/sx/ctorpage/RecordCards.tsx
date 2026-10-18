"use client";

import "./sx-ctorpage.css";
import type { ReactElement, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { enterStyle } from "../hooks";
import { ClockIcon, glyph } from "../icons";
import type { SxColumn, SxRowAction, SxRowGroup } from "../layout/Table";
import { groupRows } from "../layout/tableModel";
import { StatusPill } from "../StatusPill";
import { isQuietRow } from "./quiet";
import { RowTools } from "./RowTools";
import { rowTitle, StatusTile, updatedText, type RecordRow, type VariantCtx } from "./variants";

const FACT_SKIP: ReadonlySet<string> = new Set(["title", "status", "updated"]);
const FACTS_MAX = 3;
const SKELETONS = [0, 1, 2, 3, 4, 5];

export type RecordCardsProps = {
  rows: readonly RecordRow[];
  columns: readonly SxColumn<RecordRow>[];
  ctx: VariantCtx;
  caption: string;
  hrefOf: (row: RecordRow) => string;
  actionsOf: (row: RecordRow) => readonly SxRowAction<RecordRow>[];
  groupBy?: (row: RecordRow) => SxRowGroup;
  loading: boolean;
  busy: boolean;
  error?: ReactNode;
  empty: ReactNode;
  footer?: ReactNode;
};

const BASE = "admin.studio.list.cards";

function metaOf(row: RecordRow, ctx: VariantCtx): string[] {
  const r = row.rec;
  const out: string[] = [];
  if (r.version) out.push(ctx.t("sx.layout.version", { n: r.version }));
  if (r.owner) out.push(r.owner);
  if (r.source === "runtime" && r.studioObjectId) out.push(ctx.t("sx.cpage.hasDraft"));
  return out;
}

function Card({ row, index, columns, ctx, href, actions, level }: { row: RecordRow; index: number; level: "h2" | "h3"; columns: readonly SxColumn<RecordRow>[]; ctx: VariantCtx; href: string; actions: readonly SxRowAction<RecordRow>[] }): ReactElement {
  const r = row.rec;
  const title = rowTitle(r) || ctx.t("sx.ui.untitled");
  const facts = columns.filter((c) => !FACT_SKIP.has(c.key)).slice(0, FACTS_MAX);
  const meta = metaOf(row, ctx);
  const muted = isQuietRow(r.title, String(row.extra?.status ?? "") || r.status);
  const key = `${r.source}-${r.id}`;
  const Heading = level;
  return (
    <li
      className="sx-cp-card sx-lift sx-enter"
      style={enterStyle(Math.min(index, 12))}
      data-muted={muted ? "" : undefined}
      data-ai-id={aiIdOf("admin.studio.list.item", r.id)}
      data-ai-type="list_item"
      data-ai-entity-type={r.source === "studio" ? "studio_object" : "studio_runtime_record"}
      data-ai-entity-id={r.id}
      data-ai-label={title}
    >
      <div className="sx-cp-card__top">
        <StatusTile status={r.status} source={r.source} size="lg" />
        {r.status ? <StatusPill status={r.status} source={r.source} size="sm" /> : null}
      </div>
      <Heading className="sx-cp-card__title">
        {href ? (
          <Link href={href} className="sx-cp-card__link" data-ai-id={aiIdOf(BASE, "open", key)} data-ai-type="link" data-ai-label={title}>
            {title}
          </Link>
        ) : (
          title
        )}
      </Heading>
      {meta.length ? (
        <p className="sx-cp-card__meta">
          {meta.map((m, i) => (
            <span key={i} className="sx-cp-name__part">
              {m}
            </span>
          ))}
        </p>
      ) : null}
      {facts.length ? (
        <dl className="sx-cp-card__facts">
          {facts.map((c) => (
            <div key={c.key} className="sx-cp-card__fact">
              <dt>{c.header}</dt>
              <dd>{c.cell(row, index)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="sx-cp-card__foot">
        {r.updatedAt ? (
          <time className="sx-cp-card__when" dateTime={r.updatedAt} title={ctx.labels.dateTime(r.updatedAt)}>
            {glyph(ClockIcon, { size: 14 })}
            {updatedText(r.updatedAt, ctx)}
          </time>
        ) : (
          <span />
        )}
        <RowTools row={row} actions={actions} base={aiIdOf(BASE, "row", key)} label={ctx.t("sx.table.actionsFor", { name: title })} />
      </div>
    </li>
  );
}

export function RecordCards({ rows, columns, ctx, caption, hrefOf, actionsOf, groupBy, loading, busy, error, empty, footer }: RecordCardsProps): ReactElement {
  let body: ReactNode;
  if (error) body = error;
  else if (loading && !rows.length) {
    body = (
      <ul className="sx-cp-cards" aria-hidden="true">
        {SKELETONS.map((i) => (
          <li key={i} className="sx-cp-card" data-sk="">
            <span className="sx-sk sx-cp-card__sk" data-w="tile" />
            <span className="sx-sk sx-cp-card__sk" data-w="title" />
            <span className="sx-sk sx-cp-card__sk" data-w="line" />
            <span className="sx-sk sx-cp-card__sk" data-w="short" />
          </li>
        ))}
      </ul>
    );
  } else if (!rows.length) body = empty;
  else {
    const groups: { group: SxRowGroup | null; rows: RecordRow[] }[] = groupBy ? groupRows(rows, groupBy) : [{ group: null, rows: [...rows] }];
    let at = 0;
    body = groups.map(({ group, rows: list }, gi) => {
      const start = at;
      at += list.length;
      return (
        <section key={group ? `${group.key}-${gi}` : "cards"} className="sx-cp-cgroup" aria-label={group ? group.title : caption}>
          {group ? (
            <h2 className="sx-cp-cgroup__head">
              <span className="sx-cp-cgroup__title">{group.title}</span>
              {group.meta ? <span className="sx-cp-cgroup__meta">{group.meta}</span> : null}
            </h2>
          ) : null}
          <ul className="sx-cp-cards">
            {list.map((row, j) => (
              <Card key={`${row.rec.source}-${row.rec.id}`} row={row} index={start + j} columns={columns} ctx={ctx} href={hrefOf(row)} actions={actionsOf(row)} level={group ? "h3" : "h2"} />
            ))}
          </ul>
        </section>
      );
    });
  }
  return (
    <div className="sx-cp-cardwrap" aria-busy={busy || (loading && !rows.length) || undefined} data-busy={busy ? "" : undefined} data-ai-id={BASE} data-ai-type="list" data-ai-label={caption}>
      {body}
      {footer ? <div className="sx-cp-cardfoot">{footer}</div> : null}
    </div>
  );
}
