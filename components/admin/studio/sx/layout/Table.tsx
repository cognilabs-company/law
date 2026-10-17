"use client";

import "../sx-core.css";
import "../sx-layout.css";
import { useId, useState, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import Menu, { type MenuEntry } from "@/components/ui/Menu";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { SxButton, SxLinkButton } from "../Button";
import { ArrowsDownUpIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, CaretUpIcon, glyph, moreGlyph } from "../icons";
import type { SxIcon } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { SxEmpty } from "./Empty";
import { groupRows, isInteractiveTarget, nextSort, sortRows } from "./tableModel";
import { cx, domId } from "./util";

export type SxColumn<T> = {
  key: string;
  header: string;
  cell: (row: T, index: number) => ReactNode;
  sortValue?: (row: T) => string | number | null;
  align?: "start" | "end" | "center";
  width?: string;
  numeric?: boolean;
  primary?: boolean;
  hideBelow?: "md" | "lg";
  srOnlyHeader?: boolean;
};

export type SxRowAction<T> = {
  key: string;
  label: string;
  icon?: SxIcon;
  onSelect?: (row: T) => void;
  href?: (row: T) => string;
  danger?: boolean;
  disabled?: (row: T) => boolean | string;
  hidden?: (row: T) => boolean;
};

export type SxSort = { key: string; dir: "asc" | "desc" };
export type SxRowGroup = { key: string; title: string; meta?: ReactNode };

export type SxTableProps<T> = {
  rows: readonly T[];
  columns: readonly SxColumn<T>[];
  rowKey: (row: T) => string;
  caption: string;
  loading?: boolean;
  skeletonRows?: number;
  busy?: boolean;
  empty?: ReactNode;
  error?: ReactNode;
  sort?: SxSort | null;
  onSortChange?: (sort: SxSort | null) => void;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  rowActions?: readonly SxRowAction<T>[] | ((row: T) => readonly SxRowAction<T>[]);
  rowTitle?: (row: T) => string;
  rowTone?: (row: T) => "muted" | undefined;
  groupBy?: (row: T) => SxRowGroup;
  stickyHeader?: boolean;
  stacked?: "auto" | "never";
  footer?: ReactNode;
  aiId?: string;
};

type ActionsProps<T> = {
  row: T;
  actions: readonly SxRowAction<T>[];
  title: string;
  base: string;
  uid: string;
  menuOnly: boolean;
};

const DEFAULT_SKELETON_ROWS = 6;
const MAX_SKELETON_ROWS = 50;

function plainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node).trim();
  if (Array.isArray(node)) return node.map(plainText).filter(Boolean).join(" ");
  return "";
}

function skeletonCount(n: number): number {
  return Number.isFinite(n) ? Math.min(MAX_SKELETON_ROWS, Math.max(1, Math.floor(n))) : DEFAULT_SKELETON_ROWS;
}

function shownActions<T>(row: T, actions: readonly SxRowAction<T>[]): SxRowAction<T>[] {
  return actions.filter((a) => !a.hidden?.(row));
}

function RowActions<T>({ row, actions, title, base, uid, menuOnly }: ActionsProps<T>) {
  const t = useTranslations("studio");
  const shown = shownActions(row, actions);
  if (!shown.length) return null;
  if (shown.length === 1 && !menuOnly) {
    const a = shown[0];
    const off = a.disabled?.(row) ?? false;
    const reason = typeof off === "string" ? off : "";
    const whyId = reason ? `${uid}-why` : undefined;
    const href = a.href?.(row);
    const text = <span className="sx-table__alabel">{a.label}</span>;
    if (href && !off) {
      return (
        <SxLinkButton variant="ghost" size="sm" icon={a.icon} href={href} aiId={aiIdOf(base, "action", a.key)} aiLabel={a.label}>
          {text}
        </SxLinkButton>
      );
    }
    return (
      <>
        <SxButton
          variant={a.danger ? "danger" : "ghost"}
          size="sm"
          icon={a.icon}
          aria-disabled={off ? true : undefined}
          aria-describedby={whyId}
          title={reason || undefined}
          onClick={() => {
            if (!off) a.onSelect?.(row);
          }}
          aiId={aiIdOf(base, "action", a.key)}
          aiLabel={a.label}
        >
          {text}
        </SxButton>
        {reason ? (
          <span id={whyId} className="sx-vh">
            {reason}
          </span>
        ) : null}
      </>
    );
  }
  const items: MenuEntry[] = shown.map((a) => {
    const off = a.disabled?.(row) ?? false;
    return {
      key: a.key,
      label: a.label,
      icon: a.icon ? glyph(a.icon, { size: 16 }) : undefined,
      onSelect: a.onSelect ? () => a.onSelect?.(row) : undefined,
      href: off ? undefined : a.href?.(row),
      danger: a.danger,
      disabled: off || undefined,
      aiId: aiIdOf(base, "action", a.key),
    };
  });
  return (
    <Menu
      items={items}
      label={title ? t("sx.table.actionsFor", { name: title }) : t("sx.table.actions")}
      className="sx-pop sx-menu"
      triggerClassName="sx-ibtn"
      size="sm"
      icon={moreGlyph()}
      align="end"
      aiId={aiIdOf(base, "actions")}
    />
  );
}

export function SxTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  loading = false,
  skeletonRows = 6,
  busy = false,
  empty,
  error,
  sort,
  onSortChange,
  rowHref,
  onRowClick,
  rowActions,
  rowTitle,
  rowTone,
  groupBy,
  stickyHeader = true,
  stacked = "auto",
  footer,
  aiId,
}: SxTableProps<T>): ReactElement {
  const t = useTranslations("studio");
  const locale = useLocale();
  const router = useRouter();
  const uid = useId();
  const controlled = onSortChange !== undefined;
  const [own, setOwn] = useState<SxSort | null>(sort ?? null);
  const active = controlled ? (sort ?? null) : own;
  const base = aiId ?? "admin.studio.table";
  const hasActions = !!rowActions;
  const span = columns.length + (hasActions ? 1 : 0);

  const sortColumn = active ? columns.find((c) => c.key === active.key && c.sortValue) : undefined;
  const order = (list: readonly T[]): T[] => (!controlled && active && sortColumn?.sortValue ? sortRows(list, sortColumn.sortValue, active.dir, locale) : [...list]);
  const groups = groupBy ? groupRows(rows, groupBy).map((g) => ({ group: g.group, rows: order(g.rows) })) : [{ group: null as SxRowGroup | null, rows: order(rows) }];

  const toggle = (key: string) => {
    const next = nextSort(active, key);
    if (controlled) onSortChange?.(next);
    else setOwn(next);
  };

  const actionsOf = (row: T): readonly SxRowAction<T>[] => (typeof rowActions === "function" ? rowActions(row) : (rowActions ?? []));
  const menuOnly = hasActions && rows.some((row) => shownActions(row, actionsOf(row)).length > 1);

  const activate = (e: MouseEvent<HTMLTableRowElement>, row: T) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (isInteractiveTarget(e.target, e.currentTarget)) return;
    if (window.getSelection()?.toString()) return;
    const href = rowHref?.(row);
    if (href) router.push(href);
    else onRowClick?.(row);
  };

  const clickable = !!rowHref || !!onRowClick;
  const offsets = groups.map((_, gi) => groups.slice(0, gi).reduce((sum, g) => sum + g.rows.length, 0));

  const renderRow = (row: T, i: number) => {
    const key = rowKey(row);
    const href = rowHref?.(row);
    const cells = columns.map((c) => c.cell(row, i));
    const primaryAt = columns.findIndex((c) => c.primary);
    const title = rowTitle?.(row) || (primaryAt >= 0 ? plainText(cells[primaryAt]) : "");
    const muted = rowTone?.(row) === "muted";
    return (
      <tr
        key={key}
        role="row"
        className="sx-table__row"
        data-muted={muted || undefined}
        data-click={clickable && (href || onRowClick) ? "" : undefined}
        onClick={clickable ? (e) => activate(e, row) : undefined}
      >
        {columns.map((c, ci) => {
          const content = cells[ci];
          const attrs = {
            className: cx("sx-table__cell", c.primary && "sx-table__cell--primary", c.numeric && "sx-num"),
            "data-label": c.header,
            "data-align": c.numeric ? "end" : (c.align ?? undefined),
            "data-hide": c.hideBelow,
          };
          if (c.primary) {
            const inner = href ? (
              <Link href={href} className="sx-table__primary" data-ai-id={aiIdOf(base, "row", key)} data-ai-type="link" data-ai-label={title || undefined}>
                {content}
              </Link>
            ) : onRowClick ? (
              <button type="button" className="sx-table__primary" onClick={() => onRowClick(row)} data-ai-id={aiIdOf(base, "row", key)} data-ai-type="button" data-ai-label={title || undefined}>
                {content}
              </button>
            ) : (
              content
            );
            return (
              <th key={c.key} scope="row" role="rowheader" {...attrs}>
                {inner}
              </th>
            );
          }
          return (
            <td key={c.key} role="cell" {...attrs}>
              <div className="sx-table__v">{content}</div>
            </td>
          );
        })}
        {hasActions ? (
          <td role="cell" className="sx-table__cell sx-table__actions">
            <RowActions row={row} actions={actionsOf(row)} title={title} base={aiIdOf(base, "row", key)} uid={domId(uid, key)} menuOnly={menuOnly} />
          </td>
        ) : null}
      </tr>
    );
  };

  let body: ReactNode;
  if (error) {
    body = (
      <tbody role="rowgroup">
        <tr role="row" className="sx-table__state">
          <td role="cell" colSpan={span}>
            {error}
          </td>
        </tr>
      </tbody>
    );
  } else if (loading && !rows.length) {
    body = (
      <tbody role="rowgroup">
        {Array.from({ length: skeletonCount(skeletonRows) }, (_, i) => (
          <tr key={i} className="sx-table__row sx-table__skrow" aria-hidden="true">
            {columns.map((c) => (
              <td key={c.key} className="sx-table__cell" data-hide={c.hideBelow} data-align={c.numeric ? "end" : (c.align ?? undefined)}>
                <span className="sx-sk sx-table__sk" data-primary={c.primary || undefined} />
              </td>
            ))}
            {hasActions ? <td className="sx-table__cell sx-table__actions" /> : null}
          </tr>
        ))}
      </tbody>
    );
  } else if (!rows.length) {
    body = (
      <tbody role="rowgroup">
        <tr role="row" className="sx-table__state">
          <td role="cell" colSpan={span}>
            {empty ?? <SxEmpty compact title={t("sx.table.empty")} />}
          </td>
        </tr>
      </tbody>
    );
  } else {
    body = groups.map(({ group, rows: list }, gi) => (
      <tbody key={group ? `${group.key}-${gi}` : "rows"} role="rowgroup">
        {group ? (
          <tr role="row" className="sx-table__group">
            <th scope="rowgroup" role="rowheader" colSpan={span}>
              <span className="sx-table__gtitle">{group.title}</span>
              {group.meta ? <span className="sx-table__gmeta">{group.meta}</span> : null}
            </th>
          </tr>
        ) : null}
        {list.map((row, j) => renderRow(row, offsets[gi] + j))}
      </tbody>
    ));
  }

  return (
    <div className="sx-table-wrap" data-ai-id={aiId} data-ai-type={aiId ? "table" : undefined} data-ai-label={aiId ? caption : undefined}>
      <table
        role="table"
        className="sx-table"
        data-stacked={stacked}
        data-sticky={stickyHeader || undefined}
        data-loading={loading && !rows.length ? "" : undefined}
        aria-busy={busy || (loading && !rows.length) || undefined}
      >
        <caption className="sx-vh">{caption}</caption>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} data-hide={c.hideBelow} style={c.width ? { width: c.width } : undefined} />
          ))}
          {hasActions ? <col className="sx-table__acol" /> : null}
        </colgroup>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((c) => {
              const dir = active && active.key === c.key ? active.dir : null;
              const label = <span className={c.srOnlyHeader ? "sx-vh" : "sx-table__htext"}>{c.header}</span>;
              return (
                <th
                  key={c.key}
                  scope="col"
                  role="columnheader"
                  className="sx-table__head"
                  data-align={c.numeric ? "end" : (c.align ?? undefined)}
                  data-hide={c.hideBelow}
                  aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      className="sx-table__sort"
                      data-dir={dir ?? undefined}
                      aria-label={t("sx.table.sortBy", { col: c.header })}
                      onClick={() => toggle(c.key)}
                      data-ai-id={aiIdOf(base, "sort", c.key)}
                      data-ai-type="button"
                      data-ai-label={c.header}
                    >
                      {label}
                      {glyph(dir === "asc" ? CaretUpIcon : dir === "desc" ? CaretDownIcon : ArrowsDownUpIcon, { size: 14, className: "sx-table__sorticon" })}
                    </button>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
            {hasActions ? (
              <th scope="col" role="columnheader" className="sx-table__head sx-table__actions">
                <span className="sx-vh">{t("sx.table.actions")}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        {body}
      </table>
      {footer ? <div className="sx-table__foot">{footer}</div> : null}
    </div>
  );
}

export type SxPagerProps = { from: number; to: number; total: number; onPrev: () => void; onNext: () => void; busy?: boolean; aiId?: string };

export function SxPager({ from, to, total, onPrev, onNext, busy = false, aiId }: SxPagerProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const all = Number.isFinite(total) ? Math.floor(total) : 0;
  const valid = Number.isFinite(from) && Number.isFinite(to) && all > 0;
  const lo = valid ? Math.min(all, Math.max(1, Math.floor(from))) : 0;
  const hi = valid ? Math.min(all, Math.max(lo, Math.floor(to))) : 0;
  const atStart = !valid || lo <= 1;
  const atEnd = !valid || hi >= all;
  return (
    <div className="sx-pager">
      <p className="sx-pager__range sx-num" aria-live="polite">
        {valid ? t("sx.table.range", { from: labels.num(lo), to: labels.num(hi), total: labels.num(all) }) : ""}
      </p>
      <div className="sx-pager__nav">
        <SxButton
          size="sm"
          icon={CaretLeftIcon}
          aria-disabled={atStart || busy || undefined}
          onClick={() => {
            if (!atStart && !busy) onPrev();
          }}
          aiId={aiIdOf(aiId ?? "admin.studio.pager", "prev")}
        >
          {t("sx.table.prev")}
        </SxButton>
        <SxButton
          size="sm"
          iconEnd={CaretRightIcon}
          aria-disabled={atEnd || busy || undefined}
          onClick={() => {
            if (!atEnd && !busy) onNext();
          }}
          aiId={aiIdOf(aiId ?? "admin.studio.pager", "next")}
        >
          {t("sx.table.next")}
        </SxButton>
      </div>
    </div>
  );
}
