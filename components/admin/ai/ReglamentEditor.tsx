"use client";

import { useEffect, useId, useRef, useState, type ComponentType, type FormEvent, type KeyboardEvent, type SVGProps } from "react";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { useAiField } from "@/lib/ai/registry";
import { ApiError, errDetail, isForbidden } from "@/lib/http";
import {
  REGLAMENT_CATEGORIES,
  REGLAMENT_STATUSES,
  createReglament,
  latestVersion,
  nextVersion,
  reglamentNeedsDetails,
  updateReglament,
  type Reglament,
  type ReglamentGap,
  type ReglamentStatus,
} from "@/lib/services/aiReglaments";
import { CategoryField, VersionField, catChoiceOf, catValue, cleanVersion, useRgl, versionProblem } from "./bits";
import { IconAlert, IconCircleCheck, IconEdit, IconHelpCircle, IconHistory, IconHourglass, IconInbox } from "@/components/icons";

export type EditorMode =
  | { kind: "create"; title?: string; category?: string; version?: string }
  | { kind: "edit"; reglament: Reglament }
  | { kind: "gap"; gap: ReglamentGap };

export type SavedInfo = {
  id: string;
  title: string;
  version: string;
  created: boolean;
  gapKey: string;
  reglament: Reglament | null;
};

type Field = "title" | "category" | "version" | "content";
type Errors = Partial<Record<Field, string>>;

type Form = {
  target: string;
  title: string;
  choice: string;
  custom: string;
  version: string;
  status: ReglamentStatus;
  content: string;
  base: Reglament | null;
};

const STATUS_ICON: Record<ReglamentStatus, ComponentType<SVGProps<SVGSVGElement>>> = {
  active: IconCircleCheck,
  draft: IconEdit,
  archived: IconInbox,
};

const FIELDS: Field[] = ["title", "category", "version", "content"];

function seedNew(content: string, category: string, title = "", version = "1.0"): Form {
  const c = catChoiceOf(category);
  return { target: "", title, choice: c.choice, custom: c.custom, version, status: "active", content, base: null };
}

function seedFrom(r: Reglament, extra: string): Form {
  const c = catChoiceOf(r.category);
  const latest = latestVersion(r);
  const body = r.content ? (extra ? `${r.content.trimEnd()}\n\n${extra}` : r.content) : extra;
  return {
    target: r.id,
    title: r.title,
    choice: c.choice,
    custom: c.custom,
    version: latest ? nextVersion(latest, "minor") : "1.0",
    status: r.status,
    content: body,
    base: r,
  };
}

function extraOf(f: Form): string {
  const base = f.base?.content.trimEnd() ?? "";
  if (!base || !f.content.startsWith(base)) return f.content;
  return f.content.slice(base.length).replace(/^\s+/, "");
}

function modeKey(m: EditorMode): string {
  return m.kind === "edit" ? `edit-${m.reglament.id}` : m.kind === "gap" ? `gap-${m.gap.key}` : "create";
}

export default function ReglamentEditor({
  mode,
  reglaments,
  resolve,
  onClose,
  onSaved,
}: {
  mode: EditorMode | null;
  reglaments: Reglament[];
  resolve: (r: Reglament) => Promise<Reglament>;
  onClose: () => void;
  onSaved: (info: SavedInfo) => void;
}) {
  const { t } = useRgl();
  const title = !mode ? "" : mode.kind === "edit" ? t("editor.editTitle") : mode.kind === "gap" ? t("editor.gapTitle") : t("editor.createTitle");
  return (
    <Modal open={mode !== null} onClose={onClose} title={title} wide aiId="admin.ai-reglaments.editor">
      {mode ? <EditorForm key={modeKey(mode)} mode={mode} reglaments={reglaments} resolve={resolve} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function EditorForm({
  mode,
  reglaments,
  resolve,
  onClose,
  onSaved,
}: {
  mode: EditorMode;
  reglaments: Reglament[];
  resolve: (r: Reglament) => Promise<Reglament>;
  onClose: () => void;
  onSaved: (info: SavedInfo) => void;
}) {
  const { t, num, when } = useRgl();
  const uid = useId();
  const gap = mode.kind === "gap" ? mode.gap : null;
  const block = gap ? `${t("editor.qLabel")}: ${gap.question.trim()}\n${t("editor.aLabel")}: ` : "";
  const [f, setF] = useState<Form>(() => {
    if (mode.kind === "edit") return seedFrom(mode.reglament, "");
    if (mode.kind === "gap") return seedNew(block, (REGLAMENT_CATEGORIES as readonly string[]).includes(mode.gap.category) ? mode.gap.category : "support");
    return seedNew("", mode.category || "support", mode.title ?? "", mode.version || "1.0");
  });
  const [tried, setTried] = useState(false);
  const [serverErr, setServerErr] = useState<Errors>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [targetBusy, setTargetBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const editId = mode.kind === "edit" ? mode.reglament.id : f.target;
  const current = f.base ? latestVersion(f.base) : "";
  const words = f.content.trim() ? f.content.trim().split(/\s+/).length : 0;

  function validate(form: Form): Errors {
    const e: Errors = {};
    if (!form.title.trim()) e.title = t("editor.errTitle");
    if (!catValue(form.choice, form.custom)) e.category = t("editor.errCategory");
    const vp = versionProblem(form.version.trim(), form.base ? latestVersion(form.base) : "");
    if (vp === "format") e.version = t("editor.errVersion");
    else if (vp === "low") e.version = t("editor.errVersionLow", { v: form.base ? latestVersion(form.base) : "" });
    if (!form.content.trim()) e.content = t("editor.errContent");
    return e;
  }

  const live = tried ? validate(f) : {};
  const err = (k: Field) => live[k] || serverErr[k] || "";

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setF((cur) => ({ ...cur, [k]: v }));
    if (k === "title" || k === "content" || k === "version") setServerErr((cur) => (cur[k as Field] ? { ...cur, [k]: "" } : cur));
    if (k === "choice" || k === "custom") setServerErr((cur) => (cur.category ? { ...cur, category: "" } : cur));
  }

  useAiField("admin.ai-reglaments.editor.title", { get: () => f.title, set: (v) => set("title", v.slice(0, 200)) });
  useAiField("admin.ai-reglaments.editor.version", { get: () => f.version, set: (v) => set("version", cleanVersion(v)) });
  useAiField("admin.ai-reglaments.editor.content", { get: () => f.content, set: (v) => set("content", v) });

  useEffect(() => {
    const el = textRef.current;
    if (!el || mode.kind !== "gap") return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
    el.scrollTop = el.scrollHeight;
  }, [mode.kind]);

  async function pickTarget(id: string) {
    if (id === f.target || targetBusy) return;
    const extra = extraOf(f);
    if (!id) {
      setF((cur) => ({ ...seedNew(extra, gap && (REGLAMENT_CATEGORIES as readonly string[]).includes(gap.category) ? gap.category : "support"), status: cur.status }));
      setServerErr({});
      return;
    }
    const r = reglaments.find((x) => x.id === id);
    if (!r) return;
    setTargetBusy(true);
    try {
      const full = reglamentNeedsDetails(r) ? await resolve(r) : r;
      setF(seedFrom(full, extra));
      setServerErr({});
    } finally {
      setTargetBusy(false);
    }
  }

  function focusField(k: Field) {
    const el = document.getElementById(`${uid}-${k}`);
    if (el) el.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || blocked || targetBusy) return;
    setTried(true);
    const problems = validate(f);
    const first = FIELDS.find((k) => problems[k]);
    if (first) {
      focusField(first);
      return;
    }
    setBusy(true);
    setNote("");
    setServerErr({});
    const input = {
      title: f.title.trim(),
      category: catValue(f.choice, f.custom),
      version: f.version.trim(),
      content: f.content.trim(),
      status: f.status,
    };
    try {
      const res = editId ? await updateReglament(editId, input) : await createReglament(input);
      if (res.kind === "missing") {
        setBlocked(true);
        return;
      }
      onSaved({ id: res.data?.id || editId, title: input.title, version: input.version, created: !editId, gapKey: gap?.key ?? "", reglament: res.data });
    } catch (x) {
      const fe = x instanceof ApiError ? x.fieldErrors : {};
      const mapped: Errors = {};
      for (const k of FIELDS) if (fe[k]) mapped[k] = fe[k];
      const hasField = Object.keys(mapped).length > 0;
      if (hasField) setServerErr(mapped);
      const status = x instanceof ApiError ? x.status : 0;
      setNote(
        isForbidden(x)
          ? t("error.forbiddenAction")
          : hasField
            ? t("editor.errFix")
            : errDetail(x) || (status === 409 ? t("editor.errConflict") : t("editor.errSave")),
      );
    } finally {
      setBusy(false);
    }
  }

  function onStatusKey(e: KeyboardEvent<HTMLDivElement>) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = REGLAMENT_STATUSES.indexOf(f.status);
    const next = REGLAMENT_STATUSES[(i + dir + REGLAMENT_STATUSES.length) % REGLAMENT_STATUSES.length];
    set("status", next);
    document.getElementById(`${uid}-st-${next}`)?.focus();
  }

  const editing = Boolean(editId);
  const contentUnknown = editing && f.base !== null && !f.base.content;
  const targetOpts = [
    { value: "", label: t("editor.targetNew") },
    ...reglaments.filter((r) => r.id).map((r) => ({ value: r.id, label: r.version ? `${r.title} · v${r.version}` : r.title })),
  ];

  return (
    <form className="cform rgl-ed" onSubmit={submit} noValidate>
      {gap ? (
        <div className="rgl-ed__gap">
          <span className="rgl-ed__gapico" aria-hidden>
            <IconHelpCircle />
          </span>
          <div className="rgl-ed__gapm">
            <span className="rgl-ed__gapl">{t("editor.gapLabel")}</span>
            <q>{gap.question}</q>
            <small>{[t("gaps.asked", { n: gap.count }), gap.lastAskedAt ? t("gaps.last", { date: when(gap.lastAskedAt) }) : ""].filter(Boolean).join(" · ")}</small>
          </div>
        </div>
      ) : null}

      {gap && reglaments.some((r) => r.id) ? (
        <div className="rgl-fld" data-ai-id="admin.ai-reglaments.editor.target" data-ai-type="select" data-ai-label={t("editor.target")}>
          <label>{t("editor.target")}</label>
          <Select value={f.target} onChange={(v) => void pickTarget(v)} options={targetOpts} ariaLabel={t("editor.target")} />
          <p className="rf__hint">{targetBusy ? t("editor.targetLoading") : f.target ? t("editor.targetHintOld") : t("editor.targetHintNew")}</p>
        </div>
      ) : null}

      <div className="rgl-ed__grid">
        <div className="rgl-ed__side">
          <div className="rgl-fld">
            <label htmlFor={`${uid}-title`}>{t("editor.title")}</label>
            <input
              id={`${uid}-title`}
              value={f.title}
              onChange={(e) => set("title", e.target.value.slice(0, 200))}
              placeholder={t("editor.titlePh")}
              autoComplete="off"
              aria-invalid={Boolean(err("title"))}
              autoFocus={mode.kind === "create"}
              data-ai-id="admin.ai-reglaments.editor.title"
              data-ai-type="input"
              data-ai-label={t("editor.title")}
            />
            {err("title") ? (
              <p className="rgl-err" role="alert">
                {err("title")}
              </p>
            ) : null}
          </div>

          <CategoryField
            id={`${uid}-category`}
            choice={f.choice}
            custom={f.custom}
            onChoice={(v) => set("choice", v)}
            onCustom={(v) => set("custom", v)}
            error={err("category")}
            aiId="admin.ai-reglaments.editor.category"
          />

          <VersionField id={`${uid}-version`} value={f.version} onChange={(v) => set("version", v)} current={current} error={err("version")} aiId="admin.ai-reglaments.editor.version" />

          <div className="rgl-fld">
            <span className="rgl-fld__l" id={`${uid}-st`}>
              {t("editor.status")}
            </span>
            <div className="rgl-seg" role="radiogroup" aria-labelledby={`${uid}-st`} onKeyDown={onStatusKey} data-ai-id="admin.ai-reglaments.editor.status" data-ai-type="select" data-ai-label={t("editor.status")}>
              {REGLAMENT_STATUSES.map((s) => {
                const Glyph = STATUS_ICON[s];
                return (
                  <button
                    key={s}
                    id={`${uid}-st-${s}`}
                    type="button"
                    role="radio"
                    aria-checked={f.status === s}
                    tabIndex={f.status === s ? 0 : -1}
                    className={`rgl-seg__b rgl-seg__b--${s}`}
                    onClick={() => set("status", s)}
                  >
                    <Glyph aria-hidden />
                    {t(`status.${s}`)}
                  </button>
                );
              })}
            </div>
            <p className="rf__hint">{t(`editor.statusHint.${f.status}`)}</p>
          </div>
        </div>

        <div className="rgl-ed__main">
          <div className="rgl-ed__lblrow">
            <label htmlFor={`${uid}-content`}>{t("editor.content")}</label>
            <span className="rgl-ed__count">{t("editor.count", { chars: num(f.content.length), words: num(words) })}</span>
          </div>
          <textarea
            id={`${uid}-content`}
            ref={textRef}
            className="rgl-ed__text"
            value={f.content}
            onChange={(e) => set("content", e.target.value)}
            placeholder={t("editor.contentPh")}
            aria-invalid={Boolean(err("content"))}
            data-ai-id="admin.ai-reglaments.editor.content"
            data-ai-type="textarea"
            data-ai-label={t("editor.content")}
          />
          {err("content") ? (
            <p className="rgl-err" role="alert">
              {err("content")}
            </p>
          ) : null}
          {gap ? (
            <p className="rgl-note rgl-note--info">
              <IconHelpCircle aria-hidden />
              {t("editor.gapNote")}
            </p>
          ) : null}
          {contentUnknown ? (
            <p className="rgl-note rgl-note--warn">
              <IconAlert aria-hidden />
              {t("editor.contentMissing")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rgl-ed__foot">
        {blocked ? (
          <p className="rgl-note rgl-note--warn" role="status">
            <IconHourglass aria-hidden />
            {t("missing.writeText")}
          </p>
        ) : (
          <p className="rgl-note rgl-note--info">
            <IconHistory aria-hidden />
            {editing ? t("editor.newVersionNote") : t("editor.firstVersionNote")}
          </p>
        )}
        {note ? (
          <p className="rgl-note rgl-note--err" role="alert">
            <IconAlert aria-hidden />
            {note}
          </p>
        ) : null}
        <div className="rgl-ed__btns">
          <button type="button" className="btn btn--line btn--sm" onClick={onClose}>
            {t("editor.cancel")}
          </button>
          <button type="submit" className="btn btn--pri btn--sm" disabled={busy || blocked || targetBusy} data-ai-id="admin.ai-reglaments.editor.save">
            {busy ? t("editor.saving") : editing ? t("editor.saveVersion") : t("editor.save")}
          </button>
        </div>
      </div>
    </form>
  );
}
