"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-schema.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { normPath } from "@/lib/studioSchema";
import { useSxFormContext } from "../form/formPolicy";
import { SxNote } from "../layout/Note";
import type { SchemaModel } from "../contract";
import type { SxErrors, SxRule } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { RECORD_TITLE_PATH, labelTrail, patternOf, schemaFieldAt } from "./model";

const MAX_SHOWN = 12;

export type SummaryRow = { path: string; field: string; message: string };

export function SchemaErrorSummary({ model, errors, onPick }: { model: SchemaModel; errors: SxErrors; onPick: (path: string) => void }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const policy = useSxFormContext();
  const seen = new Set<string>();
  const rows: SummaryRow[] = [];
  for (const [raw, token] of Object.entries(errors)) {
    if (!token) continue;
    const path = raw === RECORD_TITLE_PATH ? raw : normPath(raw) || "_";
    if (seen.has(path)) continue;
    const shown = policy ? policy.visible(path, errors) : token;
    if (!shown) continue;
    seen.add(path);
    const f = path === RECORD_TITLE_PATH || path === "_" ? null : schemaFieldAt(model.ctor.typed, patternOf(path));
    const key = path.split(".").filter((s) => !/^\d+$/.test(s)).pop() ?? "";
    const rule: SxRule = f
      ? { type: f.type, key: f.key, ctor: model.code, path, min: f.min, max: f.max, minItems: f.minItems, source: f.source || f.item?.source || "", options: f.optionLabels }
      : { type: "text", key, ctor: model.code, path };
    rows.push({ path, field: labelTrail(model, path, labels, t), message: labels.error(shown, rule) });
  }
  if (!rows.length) return null;
  const list = rows.slice(0, MAX_SHOWN);
  const more = rows.length - list.length;
  return (
    <div className="sx-sf-sum" data-ai-id="admin.studio.editor.errors" data-ai-type="section" data-ai-label={t("sx.err.summary")}>
      <SxNote tone="error" role="alert" title={t("sx.err.summary")}>
        <p className="sx-sf-sum__count">{t("sx.sf.count", { n: rows.length })}</p>
        <ul className="sx-sf-sum__list">
          {list.map((r) => (
            <li key={r.path}>
              <button type="button" className="sx-sf-sum__link" onClick={() => onPick(r.path)}>
                <span className="sx-sf-sum__field">{r.field}</span>
                <span className="sx-sf-sum__msg">{r.message}</span>
              </button>
            </li>
          ))}
        </ul>
        {more > 0 ? <p className="sx-sf-sum__more">{t("sx.ui.andMore", { n: more })}</p> : null}
      </SxNote>
    </div>
  );
}
