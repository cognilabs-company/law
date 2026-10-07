"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Skeleton } from "@/components/portal/DataState";
import { getReglament, mergeReglament, reglamentNeedsDetails, type Reglament, type ReglamentVersion } from "@/lib/services/aiReglaments";
import { CategoryChip, ReglamentGlyph, StatusPill, VersionBadge, useRgl } from "./bits";
import { IconClose, IconEdit, IconFileText, IconHistory, IconPaperclip } from "@/components/icons";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function ReglamentDrawer({
  reglament,
  canEdit,
  editBusy,
  onEdit,
  onClose,
}: {
  reglament: Reglament | null;
  canEdit: boolean;
  editBusy: boolean;
  onEdit: (r: Reglament) => void;
  onClose: () => void;
}) {
  if (!reglament) return null;
  return <DrawerPanel key={reglament.id || reglament.title} base={reglament} canEdit={canEdit} editBusy={editBusy} onEdit={onEdit} onClose={onClose} />;
}

function DrawerPanel({
  base,
  canEdit,
  editBusy,
  onEdit,
  onClose,
}: {
  base: Reglament;
  canEdit: boolean;
  editBusy: boolean;
  onEdit: (r: Reglament) => void;
  onClose: () => void;
}) {
  const { t, when, num } = useRgl();
  const uid = useId();
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const [detail, setDetail] = useState<{ id: string; data: Reglament | null } | null>(null);
  const [picked, setPicked] = useState("");
  const needs = reglamentNeedsDetails(base);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!needs) return;
    let alive = true;
    getReglament(base.id).then((data) => {
      if (alive) setDetail({ id: base.id, data });
    });
    return () => {
      alive = false;
    };
  }, [base.id, needs]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (prev?.isConnected) prev.focus?.({ preventScroll: true });
    };
  }, []);

  function trap(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const loading = needs && detail?.id !== base.id;
  const r = mergeReglament(base, detail?.id === base.id ? detail.data : null);
  const current: ReglamentVersion = {
    key: "current",
    id: "",
    version: r.version,
    status: r.status,
    content: r.content,
    createdAt: r.updatedAt,
    author: r.author,
    source: r.source,
    fileName: r.fileName,
    note: "",
  };
  const history = r.versions.length ? r.versions : r.version || r.content ? [current] : [];
  const viewing = picked && history.some((v) => v.version === picked) ? picked : r.version;
  const viewed = history.find((v) => v.version === viewing);
  const shown = viewing === r.version ? r.content || viewed?.content || "" : viewed?.content || "";
  const words = shown.trim() ? shown.trim().split(/\s+/).length : 0;
  const fromFile = Boolean(r.fileName) || r.source === "upload" || r.source === "file";

  return (
    <>
      <button type="button" className="rgl-drw__scrim" aria-label={t("drawer.close")} tabIndex={-1} onClick={onClose} />
      <aside
        ref={panel}
        className="rgl-drw"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-t`}
        tabIndex={-1}
        onKeyDown={trap}
        data-ai-id="admin.ai-reglaments.drawer"
        data-ai-type="modal"
        data-ai-label={r.title}
      >
        <header className="rgl-drw__head">
          <ReglamentGlyph status={r.status} big />
          <div className="rgl-drw__ht">
            <span className="rgl-drw__eyebrow">{t("drawer.eyebrow")}</span>
            <h2 id={`${uid}-t`}>{r.title}</h2>
            <div className="rgl-drw__chips">
              <CategoryChip category={r.category} />
              <VersionBadge version={r.version} />
              <StatusPill status={r.status} raw={r.statusRaw} />
            </div>
          </div>
          <button type="button" className="rgl-drw__x" onClick={onClose} aria-label={t("drawer.close")}>
            <IconClose aria-hidden />
          </button>
        </header>

        <div className="rgl-drw__body">
          <dl className="rgl-drw__kv">
            <div>
              <dt>{t("drawer.updated")}</dt>
              <dd>{when(r.updatedAt) || "—"}</dd>
            </div>
            <div>
              <dt>{t("drawer.created")}</dt>
              <dd>{when(r.createdAt) || "—"}</dd>
            </div>
            <div>
              <dt>{t("drawer.source")}</dt>
              <dd>{fromFile ? r.fileName || t("drawer.sourceFile") : t("drawer.sourceEditor")}</dd>
            </div>
            <div>
              <dt>{t("drawer.author")}</dt>
              <dd>{r.author || "—"}</dd>
            </div>
          </dl>

          {canEdit && r.id ? (
            <div className="rgl-drw__cta">
              <button type="button" className="btn btn--pri btn--sm" onClick={() => onEdit(r)} disabled={editBusy || loading} data-ai-id="admin.ai-reglaments.drawer.new-version">
                <IconEdit aria-hidden />
                {t("drawer.newVersion")}
              </button>
              <p>{t("drawer.newVersionHint")}</p>
            </div>
          ) : null}

          <section className="rgl-drw__sec" aria-labelledby={`${uid}-doc`}>
            <div className="rgl-drw__lbl">
              <span id={`${uid}-doc`}>
                <IconFileText aria-hidden />
                {viewing && viewing !== r.version ? t("drawer.textOf", { v: viewing }) : t("drawer.text")}
              </span>
              {shown ? <small>{t("editor.count", { chars: num(shown.length), words: num(words) })}</small> : null}
            </div>
            {shown ? (
              <div className="rgl-doc" tabIndex={0} aria-labelledby={`${uid}-doc`}>
                {shown}
              </div>
            ) : loading ? (
              <Skeleton rows={3} />
            ) : (
              <p className="rgl-empty">{t("drawer.noText")}</p>
            )}
          </section>

          <section className="rgl-drw__sec" aria-labelledby={`${uid}-hist`}>
            <div className="rgl-drw__lbl">
              <span id={`${uid}-hist`}>
                <IconHistory aria-hidden />
                {t("drawer.history")}
              </span>
              {history.length ? <small>{t("drawer.versionsCount", { n: history.length })}</small> : null}
            </div>
            {history.length ? (
              <ol className="rgl-tl">
                {history.map((v) => {
                  const isCur = v.version === r.version;
                  const readable = isCur ? Boolean(r.content || v.content) : Boolean(v.content);
                  const meta = [when(v.createdAt), v.author, v.fileName ? v.fileName : ""].filter(Boolean).join(" · ");
                  return (
                    <li key={v.key} className={`rgl-tl__i${v.version === viewing ? " on" : ""}${isCur ? " is-cur" : ""}`}>
                      <button type="button" className="rgl-tl__btn" onClick={() => setPicked(v.version)} disabled={!readable} aria-pressed={v.version === viewing}>
                        <span className="rgl-tl__dot" aria-hidden />
                        <span className="rgl-tl__m">
                          <span className="rgl-tl__top">
                            <b>{v.version ? `v${v.version}` : "—"}</b>
                            {isCur ? <em className="rgl-tl__cur">{t("drawer.current")}</em> : null}
                            {v.status && !isCur ? <StatusPill status={v.status} /> : null}
                            {v.fileName ? <IconPaperclip className="rgl-tl__clip" aria-hidden /> : null}
                          </span>
                          {meta ? <small>{meta}</small> : null}
                          {v.note ? <small className="rgl-tl__note">{v.note}</small> : null}
                          {!readable ? <small className="rgl-tl__none">{t("drawer.noVersionText")}</small> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : loading ? null : (
              <p className="rgl-empty">{t("drawer.noHistory")}</p>
            )}
            {loading ? <Skeleton rows={2} /> : null}
            {!loading && !r.versions.length && history.length ? <p className="rgl-empty">{t("drawer.onlyCurrent")}</p> : null}
          </section>
        </div>
      </aside>
    </>
  );
}
