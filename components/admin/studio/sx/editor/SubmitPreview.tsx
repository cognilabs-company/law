"use client";

import "../sx-core.css";
import "./sx-editor-panels.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { logApiError } from "@/lib/http";
import { previewStudioDraft, type StudioPreview } from "@/lib/services/studio";
import { normErrorPaths, normPath } from "@/lib/studioSchema";
import { CircleAlertIcon, MapPinIcon, TriangleAlertIcon, glyph } from "../icons";
import type { SxPayload, SxTranslate } from "../contract";
import { labelTrail, type SchemaTr } from "../schema/model";
import { useStudioLabels } from "../useStudioLabels";
import type { EditorState } from "./useEditorState";
import { fieldNamesOf } from "./EditorDialogs";

export type PreviewSource = Pick<EditorState, "model" | "code" | "runtimeTarget" | "formMode" | "recordId" | "payload"> & { previewBody?: () => SxPayload | null };

type Got = { state: "loading" } | { state: "hidden" } | { state: "ready"; preview: StudioPreview };

export type PreviewError = { path: string; field: string; token: string };

export function previewErrorsOf(preview: StudioPreview): Record<string, string> {
  const out: Record<string, string> = { ...(preview.check?.errors ?? {}), ...preview.errors };
  return normErrorPaths(out);
}

export function SubmitPreview({ st }: { st: PreviewSource }): ReactElement | null {
  const t = useTranslations("studio");
  const tr: SxTranslate = (key, values) => t(key, values);
  const labels = useStudioLabels();
  const { code, recordId } = st;
  const [got, setGot] = useState<Got>(() => (st.previewBody && code ? { state: "loading" } : { state: "hidden" }));
  const src = useRef(st.previewBody);
  useEffect(() => {
    src.current = st.previewBody;
  });

  useEffect(() => {
    const ac = new AbortController();
    const body = code ? (src.current?.() ?? null) : null;
    if (!body) {
      void Promise.resolve().then(() => {
        if (!ac.signal.aborted) setGot({ state: "hidden" });
      });
      return () => ac.abort();
    }
    previewStudioDraft(code, body, recordId, ac.signal).then(
      (preview) => {
        if (!ac.signal.aborted) setGot({ state: "ready", preview });
      },
      (e: unknown) => {
        if (ac.signal.aborted) return;
        logApiError("studio.sx.object.preview", e);
        setGot({ state: "hidden" });
      },
    );
    return () => ac.abort();
  }, [code, recordId]);

  if (got.state === "hidden") return null;
  if (got.state === "loading") {
    return (
      <section className="sx-dlg__sec sx-dlg__pv" aria-busy="true" aria-label={t("sx.editor.preview.title")} data-ai-id="admin.studio.editor.submit-preview" data-ai-type="section">
        <p className="sx-dlg__muted" data-icon="" role="status">
          <span className="sx-spin" aria-hidden="true" />
          <span>{t("sx.editor.preview.loading")}</span>
        </p>
      </section>
    );
  }

  const p = got.preview;
  const changed = fieldNamesOf(st, p.changedFields.map((f) => normPath(f).split(".")[0]).filter(Boolean), labels, tr);
  const where = [...new Set(p.whereUsed.map((s) => s.title).filter(Boolean))];
  const errs = Object.entries(previewErrorsOf(p))
    .filter(([, token]) => !!token)
    .map(([path, token]) => ({ path, field: st.model ? labelTrail(st.model, path, labels, t as unknown as SchemaTr) : path, token }));
  const empty = !changed.length && !where.length && !p.risk && !p.warnings.length && !errs.length;

  return (
    <section className="sx-dlg__sec sx-dlg__pv" aria-label={t("sx.editor.preview.title")} data-ai-id="admin.studio.editor.submit-preview" data-ai-type="section" data-ai-label={t("sx.editor.preview.title")}>
      <p className="sx-dlg__h">{t("sx.editor.preview.title")}</p>
      {p.risk ? (
        <p className="sx-dlg__muted sx-dlg__risk" data-risk={p.risk}>
          {t("sx.editor.preview.risk", { level: labels.risk(p.risk) })}
        </p>
      ) : null}
      {changed.length ? (
        <>
          <p className="sx-dlg__muted">{t("sx.editor.preview.changed")}</p>
          <ul className="sx-dlg__list">
            {changed.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      ) : null}
      {where.length ? (
        <p className="sx-dlg__muted" data-icon="">
          {glyph(MapPinIcon, { size: 16 })}
          <span>{t("sx.editor.preview.where", { list: labels.list(where, where.length) })}</span>
        </p>
      ) : null}
      {p.warnings.length ? (
        <ul className="sx-dlg__list" data-warn="">
          {p.warnings.map((w) => (
            <li key={w} data-tone="warn">
              {glyph(TriangleAlertIcon, { size: 16 })}
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {errs.length ? (
        <>
          <p className="sx-dlg__muted">{t("sx.editor.preview.errors")}</p>
          <ul className="sx-dlg__list sx-dlg__pverr" data-warn="">
            {errs.map((e) => (
              <li key={e.path} data-path={e.path}>
                {glyph(CircleAlertIcon, { size: 16 })}
                <span>
                  <b>{e.field}</b> — {labels.error(e.token, { type: "text", key: e.path.split(".").pop() ?? "", ctor: st.code, path: e.path })}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {empty ? <p className="sx-dlg__muted">{t("sx.editor.preview.none")}</p> : null}
    </section>
  );
}
