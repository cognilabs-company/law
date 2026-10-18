"use client";

import "../../sx-core.css";
import "./sx-review.css";
import { useEffect, useId, useMemo, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { SxButton } from "../../Button";
import type { SchemaModel, SxValues, SxWarning } from "../../contract";
import { firstReferencePage } from "../../form/useReferenceOptions";
import { SxNote } from "../../layout/Note";
import { useStudioLabels } from "../../useStudioLabels";
import { diffLines, diffSources, type DiffEntry, type DiffLine } from "./diff";
import type { ReviewBase } from "./useReview";

export type ChangeListProps = { base: ReviewBase; entries: readonly DiffEntry[]; model: SchemaModel | null; code: string; root: SxValues; pending: boolean };

export const DIFF_FIRST = 12;

const LEAD: Readonly<Record<ReviewBase, string>> = {
  live: "sx.appr.dw.changesVsLive",
  prev: "sx.appr.dw.changesVsPrev",
  first: "sx.appr.dw.changesFirst",
  none: "sx.appr.dw.changesNew",
  unknown: "sx.appr.dw.changesNoBase",
};

type RefMap = Map<string, Map<string, string>>;

export function WarningNote({ warnings }: { warnings: readonly SxWarning[] }): ReactElement | null {
  const t = useTranslations("studio");
  if (!warnings.length) return null;
  return (
    <SxNote tone="warn" role="note" title={t("sx.editor.dlg.warnings")} className="sx-rv-warn">
      <ul className="sx-rv-warn__list">
        {warnings.map((w) => (
          <li key={`${w.key}|${w.path ?? ""}`}>{t(w.key, w.values ? { ...w.values } : undefined)}</li>
        ))}
      </ul>
    </SxNote>
  );
}

function Value({ line, side, open }: { line: DiffLine; side: "before" | "after"; open: boolean }): ReactElement {
  const t = useTranslations("studio");
  const struck = side === "before";
  const text = side === "before" ? line.before : line.after;
  const clamp = line.long && !open ? "" : undefined;
  return (
    <span className={struck ? "sx-rv-was" : "sx-rv-now"} data-clamp={clamp}>
      {line.change === "changed" ? <span className="sx-vh">{t(struck ? "sx.appr.dw.before" : "sx.appr.dw.after")}: </span> : null}
      {struck ? <s>{text}</s> : text}
    </span>
  );
}

export function ChangeList({ base, entries, model, code, root, pending }: ChangeListProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useId();
  const [refs, setRefs] = useState<{ key: string; map: RefMap } | null>(null);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const srcKey = diffSources(entries, { model, code, root }).join("\n");

  useEffect(() => {
    if (!srcKey) return;
    let alive = true;
    const sources = srcKey.split("\n");
    Promise.all(
      sources.map((s) =>
        firstReferencePage(s).then(
          (items): [string, Map<string, string>] => [
            s,
            new Map(
              items.map((it) => {
                const o = labels.refOption(s, it);
                return [o.value, o.label];
              }),
            ),
          ],
          (): [string, Map<string, string>] => [s, new Map()],
        ),
      ),
    ).then((pairs) => {
      if (alive) setRefs({ key: srcKey, map: new Map(pairs) });
    });
    return () => {
      alive = false;
    };
  }, [srcKey, labels]);

  const map = refs?.key === srcKey ? refs.map : null;
  const { lines, other } = useMemo(
    () =>
      diffLines(entries, {
        model,
        code,
        labels,
        t,
        root,
        refName: (source, value) => map?.get(source)?.get(value) ?? labels.unknownRef(value),
      }),
    [entries, model, code, labels, t, root, map],
  );

  const shown = all ? lines : lines.slice(0, DIFF_FIRST);
  const rest = lines.length - shown.length;
  const nothing = !lines.length && !other;
  const toggle = (path: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className="sx-rv-changes" data-pending={pending ? "" : undefined} aria-busy={pending || undefined}>
      <p className="sx-rv-lead">{nothing && (base === "live" || base === "prev") ? t("sx.appr.dw.changesNone") : t(LEAD[base])}</p>
      {shown.length || other ? (
        <dl className="sx-rv-diff" data-ai-id="admin.studio.approvals.drawer.diff" data-ai-type="list" data-ai-label={t("sx.appr.dw.changes")}>
          {shown.map((l, i) => {
            const expanded = open.has(l.path);
            const valId = `${uid}-v${i}`;
            return (
              <div className="sx-rv-diff__row" key={l.path} data-change={l.change}>
                <dt>{l.label}</dt>
                <dd id={valId}>
                  {l.change !== "added" ? <Value line={l} side="before" open={expanded} /> : null}
                  {l.change !== "removed" ? <Value line={l} side="after" open={expanded} /> : null}
                  {l.change !== "changed" ? <span className="sx-rv-tag">{t(l.change === "added" ? "sx.appr.dw.added" : "sx.appr.dw.removed")}</span> : null}
                  {l.long ? (
                    <SxButton
                      variant="ghost"
                      size="sm"
                      className="sx-rv-more"
                      aria-expanded={expanded}
                      aria-controls={valId}
                      onClick={() => toggle(l.path)}
                      aiId={aiId("admin.studio.approvals.drawer.diff.expand", i)}
                    >
                      {t(expanded ? "sx.appr.dw.collapse" : "sx.appr.dw.expand")}
                    </SxButton>
                  ) : null}
                </dd>
              </div>
            );
          })}
          {other ? (
            <div className="sx-rv-diff__row" data-change="other">
              <dt>{t("sx.appr.dw.other")}</dt>
              <dd>
                <span className="sx-rv-now">{t("sx.appr.dw.otherCount", { n: other })}</span>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {rest > 0 ? (
        <div className="sx-rv-rest">
          <p>{t("sx.appr.dw.more", { n: rest })}</p>
          <SxButton variant="ghost" size="sm" onClick={() => setAll(true)} aiId="admin.studio.approvals.drawer.diff.show-all">
            {t("sx.appr.dw.showAll")}
          </SxButton>
        </div>
      ) : null}
    </div>
  );
}
