"use client";

import { useState, type DragEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { EditorField, EditorIssue, EditorSection } from "@/lib/services/templateEditor";
import { fieldsOf, orphanFields, type IssueIndex, type Selection } from "./model";
import { IconAlert, IconChevronDown, IconEdit, IconFileText, IconMenu, IconPlus, IconTrash } from "@/components/icons";

type Drag = { kind: "section" | "field"; id: string } | null;
type Over = { kind: "section" | "field" | "end"; id: string } | null;

export default function Navigator({
  sections,
  fields,
  selection,
  issues,
  skipped,
  canInsert,
  onSelect,
  onAddSection,
  onRenameSection,
  onMoveSection,
  onDropSection,
  onDeleteSection,
  onAddField,
  onMoveField,
  onDropField,
  onDeleteField,
  onInsert,
  onCreateMissing,
}: {
  sections: EditorSection[];
  fields: EditorField[];
  selection: Selection;
  issues: IssueIndex;
  skipped: Set<string>;
  canInsert: boolean;
  onSelect: (s: Selection) => void;
  onAddSection: (title: string) => void;
  onRenameSection: (id: string, title: string) => void;
  onMoveSection: (id: string, dir: -1 | 1) => void;
  onDropSection: (id: string, beforeId: string | null) => void;
  onDeleteSection: (id: string) => void;
  onAddField: (sectionId: string) => void;
  onMoveField: (uid: string, dir: -1 | 1) => void;
  onDropField: (uid: string, sectionId: string, beforeUid: string | null) => void;
  onDeleteField: (uid: string) => void;
  onInsert: (f: EditorField) => void;
  onCreateMissing: (key: string) => void;
}) {
  const t = useTranslations("admin.templateEditor");
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<Over>(null);
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const orphans = orphanFields(fields, sections);
  const typeLabel = (type: string) => (t.has(`types.${type}`) ? t(`types.${type}`) : type);

  function start(e: DragEvent, d: Drag) {
    if (!d) return;
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", d.id);
    } catch {}
    setDrag(d);
  }
  function end() {
    setDrag(null);
    setOver(null);
  }
  function overSection(e: DragEvent, id: string) {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const next: Over = drag.kind === "section" ? { kind: "section", id } : { kind: "end", id };
    if (over?.kind !== next.kind || over.id !== next.id) setOver(next);
  }
  function overField(e: DragEvent, uid: string) {
    if (!drag || drag.kind !== "field") return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (over?.kind !== "field" || over.id !== uid) setOver({ kind: "field", id: uid });
  }
  function dropOnSection(e: DragEvent, id: string) {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    if (drag.kind === "section") onDropSection(drag.id, id);
    else onDropField(drag.id, id, null);
    end();
  }
  function dropOnField(e: DragEvent, target: EditorField, orphan: boolean) {
    if (!drag || drag.kind !== "field" || orphan) return;
    e.preventDefault();
    e.stopPropagation();
    onDropField(drag.id, target.sectionId, target.uid);
    end();
  }
  function dropAtEnd(e: DragEvent) {
    if (!drag || drag.kind !== "section") return;
    e.preventDefault();
    onDropSection(drag.id, null);
    end();
  }

  function commitRename() {
    if (!renaming) return;
    const title = renaming.text.trim();
    if (title) onRenameSection(renaming.id, title);
    setRenaming(null);
  }
  function renameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setRenaming(null);
    }
  }
  function commitAdd() {
    const title = (adding ?? "").trim();
    setAdding(null);
    if (title) onAddSection(title);
  }
  function addKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitAdd();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAdding(null);
    }
  }

  const issueBadge = (list: EditorIssue[] | undefined) => {
    if (!list || !list.length) return null;
    const errs = list.filter((x) => x.level === "error").length;
    const label = errs ? t("nav.errors", { n: errs }) : t("nav.warnings", { n: list.length });
    return (
      <span className={`tpe-badge ${errs ? "tpe-badge--err" : "tpe-badge--warn"}`} title={label}>
        <IconAlert aria-hidden="true" />
        <span className="tpe-sr">{label}</span>
        {errs || list.length}
      </span>
    );
  };

  function fieldRow(f: EditorField, list: EditorField[], idx: number, orphan = false) {
    const sel = selection?.kind === "field" && selection.uid === f.uid;
    const rowIssues = f.key ? issues.byKey.get(f.key) : undefined;
    const placeable = Boolean(f.insertText) && f.savedKey === f.key;
    const isOver = over?.kind === "field" && over.id === f.uid && drag?.id !== f.uid;
    return (
      <li
        key={f.uid}
        className={`tpe-f${sel ? " is-sel" : ""}${rowIssues?.some((x) => x.level === "error") ? " has-err" : ""}${isOver ? " is-over" : ""}${drag?.id === f.uid ? " is-drag" : ""}`}
        draggable
        onDragStart={(e) => start(e, { kind: "field", id: f.uid })}
        onDragEnd={end}
        onDragOver={(e) => (orphan ? undefined : overField(e, f.uid))}
        onDrop={(e) => dropOnField(e, f, orphan)}
      >
        <span className="tpe-grip" aria-hidden="true">
          <IconMenu />
        </span>
        <button type="button" className="tpe-f__main" aria-pressed={sel} onClick={() => onSelect({ kind: "field", uid: f.uid })}>
          <span className="tpe-f__l">
            {f.label || <em>{t("nav.unnamedField")}</em>}
            {f.required ? (
              <i className="tpe-req" title={t("field.required")} aria-label={t("field.required")}>
                *
              </i>
            ) : null}
          </span>
          <span className="tpe-f__m">
            <code>{f.key || "—"}</code>
            <span>{typeLabel(f.type)}</span>
          </span>
        </button>
        <span className="tpe-f__flags">
          {skipped.has(f.uid) ? <span className="tpe-badge tpe-badge--muted" title={t("nav.notSavedHint")}>{t("nav.notSaved")}</span> : null}
          {issueBadge(rowIssues)}
        </span>
        <span className="tpe-f__acts">
          <button
            type="button"
            className="tpe-ib tpe-ib--pri"
            onClick={() => onInsert(f)}
            disabled={!placeable || !canInsert}
            title={placeable ? t("nav.insert") : t("nav.insertWait")}
            aria-label={`${t("nav.insert")}: ${f.label || f.key}`}
          >
            <IconFileText />
          </button>
          <button type="button" className="tpe-ib tpe-ib--up" onClick={() => onMoveField(f.uid, -1)} disabled={idx === 0 || orphan} aria-label={t("nav.moveUp")} title={t("nav.moveUp")}>
            <IconChevronDown />
          </button>
          <button type="button" className="tpe-ib" onClick={() => onMoveField(f.uid, 1)} disabled={idx === list.length - 1 || orphan} aria-label={t("nav.moveDown")} title={t("nav.moveDown")}>
            <IconChevronDown />
          </button>
          <button type="button" className="tpe-ib tpe-ib--danger" onClick={() => onDeleteField(f.uid)} aria-label={t("field.delete")} title={t("field.delete")}>
            <IconTrash />
          </button>
        </span>
      </li>
    );
  }

  return (
    <div className="tpe-nav">
      <div className="tpe-pane__h">
        <b>{t("nav.title")}</b>
        <span className="tpe-pane__n">{t("nav.counts", { s: sections.length, f: fields.length })}</span>
      </div>

      {issues.missingFields.length ? (
        <div className="tpe-missing" role="status">
          <b>{t("nav.missingTitle")}</b>
          <p>{t("nav.missingText")}</p>
          <ul>
            {issues.missingFields.map((k) => (
              <li key={k}>
                <code>{`{{${k}}}`}</code>
                <button type="button" className="btn btn--soft btn--sm" onClick={() => onCreateMissing(k)}>
                  <IconPlus />
                  {t("nav.createField")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!sections.length && !orphans.length ? <p className="tpe-empty">{t("nav.empty")}</p> : null}

      <ol className="tpe-secs">
        {sections.map((s, si) => {
          const list = fieldsOf(fields, s.id);
          const sel = selection?.kind === "section" && selection.id === s.id;
          const isOver = (over?.kind === "section" || over?.kind === "end") && over.id === s.id && drag?.id !== s.id;
          return (
            <li
              key={s.id}
              className={`tpe-sec${isOver ? ` is-over is-over--${over?.kind}` : ""}${drag?.id === s.id ? " is-drag" : ""}`}
              onDragOver={(e) => overSection(e, s.id)}
              onDrop={(e) => dropOnSection(e, s.id)}
            >
              <div className={`tpe-sec__h${sel ? " is-sel" : ""}`} draggable={!renaming} onDragStart={(e) => start(e, { kind: "section", id: s.id })} onDragEnd={end}>
                <span className="tpe-grip" aria-hidden="true">
                  <IconMenu />
                </span>
                {renaming?.id === s.id ? (
                  <input
                    className="tpe-sec__in"
                    value={renaming.text}
                    aria-label={t("section.title")}
                    autoFocus
                    onChange={(e) => setRenaming({ id: s.id, text: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={renameKey}
                  />
                ) : (
                  <button type="button" className="tpe-sec__t" aria-pressed={sel} onClick={() => onSelect({ kind: "section", id: s.id })} onDoubleClick={() => setRenaming({ id: s.id, text: s.title })}>
                    <span>{s.title || <em>{t("nav.unnamedSection")}</em>}</span>
                    <span className="tpe-count" aria-label={t("nav.fieldCount", { n: list.length })}>
                      {list.length}
                    </span>
                  </button>
                )}
                {issueBadge(issues.bySection.get(s.id))}
                <span className="tpe-sec__acts">
                  <button type="button" className="tpe-ib" onClick={() => setRenaming({ id: s.id, text: s.title })} aria-label={t("nav.rename")} title={t("nav.rename")}>
                    <IconEdit />
                  </button>
                  <button type="button" className="tpe-ib tpe-ib--up" onClick={() => onMoveSection(s.id, -1)} disabled={si === 0} aria-label={t("nav.moveUp")} title={t("nav.moveUp")}>
                    <IconChevronDown />
                  </button>
                  <button type="button" className="tpe-ib" onClick={() => onMoveSection(s.id, 1)} disabled={si === sections.length - 1} aria-label={t("nav.moveDown")} title={t("nav.moveDown")}>
                    <IconChevronDown />
                  </button>
                  <button type="button" className="tpe-ib tpe-ib--danger" onClick={() => onDeleteSection(s.id)} aria-label={t("section.delete")} title={t("section.delete")}>
                    <IconTrash />
                  </button>
                </span>
              </div>
              {list.length ? <ul className="tpe-fields">{list.map((f, i) => fieldRow(f, list, i))}</ul> : <p className="tpe-sec__empty">{t("nav.sectionEmpty")}</p>}
              <button type="button" className="tpe-addf" onClick={() => onAddField(s.id)}>
                <IconPlus />
                {t("nav.addField")}
              </button>
            </li>
          );
        })}
      </ol>

      {drag?.kind === "section" ? (
        <div className={`tpe-dropend${over?.kind === "end" && over.id === "" ? " is-over" : ""}`} onDragOver={(e) => { e.preventDefault(); if (over?.kind !== "end" || over.id !== "") setOver({ kind: "end", id: "" }); }} onDrop={dropAtEnd}>
          {t("nav.dropEnd")}
        </div>
      ) : null}

      {orphans.length ? (
        <div className="tpe-sec tpe-sec--orphan">
          <div className="tpe-sec__h">
            <span className="tpe-sec__t tpe-sec__t--static">
              <span>{t("nav.orphans")}</span>
              <span className="tpe-count">{orphans.length}</span>
            </span>
          </div>
          <p className="tpe-sec__empty">{t("nav.orphansHint")}</p>
          <ul className="tpe-fields">{orphans.map((f, i) => fieldRow(f, orphans, i, true))}</ul>
        </div>
      ) : null}

      {adding !== null ? (
        <div className="tpe-newsec">
          <input
            className="tpe-sec__in"
            value={adding}
            placeholder={t("nav.newSectionPh")}
            aria-label={t("section.title")}
            autoFocus
            onChange={(e) => setAdding(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={addKey}
          />
        </div>
      ) : (
        <button type="button" className="btn btn--line btn--sm tpe-addsec" onClick={() => setAdding("")}>
          <IconPlus />
          {t("nav.addSection")}
        </button>
      )}
    </div>
  );
}
