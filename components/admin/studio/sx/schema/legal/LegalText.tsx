"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "../sx-schema.css";
import "./sx-legal.css";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { SxButton, SxLinkButton } from "../../Button";
import { Field } from "../../form/Field";
import { TextInput } from "../../form/TextInput";
import { CheckIcon, ChevronDownIcon, PlusIcon, RefreshCwIcon, XIcon, glyph } from "../../icons";
import { SxNote } from "../../layout/Note";
import { SxSegmented } from "../../shared/Segmented";
import type { SxValues } from "../../contract";
import { RichText, RichTextView } from "../RichText";
import { isTranslitOff, transliterate, transliterateAvail, type TranslitAvail } from "./api";
import { EMPTY_SNAP, LANG_TABS, applyGenerated, directionOf, editedParts, langState, omissionOf, otherScript, scriptOf, stateOf, textEmpty, textOf, type GenSnap, type LangState, type LangTab, type LegalLang, type LegalText, type TrailLang, type UzScript } from "./model";
import { AudienceNote } from "../AudienceNote";

export type LegalBlockProps = {
  id: string;
  ai: string;
  label: string;
  help: string;
  required: boolean;
  readOnly: boolean;
  root: SxValues;
  emit: (path: string, value: unknown) => void;
  errorAt: (path: string) => string;
  touch: (path: string) => void;
  // The languages the constructor's own title_i18n schema lists. K07 does
  // not list English yet (backend answers 2026-11-01 N4), so the English tab
  // says Studio may not keep it, and where English is published instead.
  schemaLangs?: readonly string[];
};

type Gen = { snap: GenSnap; stale: boolean; busy: boolean; failed: boolean; avail: TranslitAvail; note: string };

const WAIT_MS = 700;

function PartEditors({ id, ai, lang, text, readOnly, errorAt, emit, touch, required }: { id: string; ai: string; lang: LegalLang; text: LegalText; readOnly: boolean; errorAt: (path: string) => string; emit: (path: string, value: unknown) => void; touch: (path: string) => void; required: boolean }): ReactElement {
  const t = useTranslations("studio");
  const titlePath = `title_i18n.${lang}`;
  const bodyPath = `body_i18n.${lang}`;
  const titleErr = errorAt(titlePath);
  const bodyErr = errorAt(bodyPath);
  const tid = `${id}-${lang}-title`;
  const bid = `${id}-${lang}-body`;
  if (readOnly) {
    return (
      <div className="sx-lg__parts">
        <div className="sx-lg__ro" data-path={titlePath}>
          <span className="sx-lg__rolabel">{t("sx.k07.part.title")}</span>
          <p className="sx-lg__rotitle">{text.title.trim() || t("sx.ui.notSet")}</p>
        </div>
        <div className="sx-lg__ro" data-path={bodyPath}>
          <span className="sx-lg__rolabel">{t("sx.k07.part.body")}</span>
          <RichTextView html={text.body} />
        </div>
      </div>
    );
  }
  return (
    <div className="sx-lg__parts">
      <div className="sx-lg__part" data-path={titlePath}>
        <Field id={tid} label={t("sx.k07.part.title")} required={required} error={titleErr} note={<AudienceNote aud={{ who: "both", use: "legalTitle" }} />}>
          {(a) => (
            <TextInput
              {...a}
              value={text.title}
              onChange={(v) => emit(titlePath, v)}
              onBlur={() => touch(titlePath)}
              invalid={!!titleErr}
              placeholder={t(`sx.k07.ph.title.${lang}`)}
              aiId={makeAiId(ai, lang, "title")}
              aiLabel={`${t("sx.k07.part.title")} · ${t(`sx.k07.script.${lang}`)}`}
            />
          )}
        </Field>
      </div>
      <div className="sx-lg__part" data-path={bodyPath}>
        <Field id={bid} label={t("sx.k07.part.body")} required={required} error={bodyErr} note={<AudienceNote aud={{ who: "both", use: "legalBody" }} />}>
          {(a) => (
            <RichText
              id={bid}
              value={text.body}
              onChange={(v) => emit(bodyPath, v)}
              onBlur={() => touch(bodyPath)}
              label={t("sx.k07.part.body")}
              invalid={!!bodyErr}
              placeholder={t(`sx.k07.ph.body.${lang}`)}
              aria-labelledby={a["aria-labelledby"]}
              aria-describedby={a["aria-describedby"]}
              aria-invalid={a["aria-invalid"]}
              aria-required={a["aria-required"]}
              aiId={makeAiId(ai, lang, "body")}
            />
          )}
        </Field>
      </div>
    </div>
  );
}

type PanelProps = Pick<LegalBlockProps, "id" | "ai" | "readOnly" | "root" | "emit" | "errorAt" | "touch" | "schemaLangs">;

// The Uzbek tab: the script the author writes in, and the other script
// prepared from it through the transliterate endpoint and kept editable.
function UzPanel({ id, ai, readOnly, root, emit, errorAt, touch }: PanelProps): ReactElement {
  const t = useTranslations("studio");
  const source = scriptOf(root.source_script);
  const target = otherScript(source);
  const src = textOf(root, source);
  const dst = textOf(root, target);
  const [gen, setGen] = useState<Gen>(() => ({ snap: EMPTY_SNAP, stale: false, busy: false, failed: false, avail: transliterateAvail(), note: "" }));
  const [open, setOpen] = useState<boolean | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const live = useRef({ root, snap: gen.snap, source });
  const firstKey = useRef<string | null>(null);
  useEffect(() => {
    live.current = { root, snap: gen.snap, source };
  });
  useEffect(() => () => ctrl.current?.abort(), []);

  const run = (force: boolean, reason: "mount" | "edit" | "manual") => {
    const now = live.current;
    const from = scriptOf(now.root.source_script);
    const to = otherScript(from);
    const ask = textOf(now.root, from);
    if (textEmpty(ask)) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setGen((g) => ({ ...g, busy: true, failed: false, note: "" }));
    transliterate({ direction: directionOf(from), title: ask.title, body: ask.body }, c.signal).then(
      (res) => {
        if (c.signal.aborted) return;
        const cur = live.current;
        if (scriptOf(cur.root.source_script) !== from) {
          setGen((g) => ({ ...g, busy: false }));
          return;
        }
        const before = textOf(cur.root, to);
        const done = applyGenerated(before, res, cur.snap, force);
        if (done.next.title !== before.title) emit(`title_i18n.${to}`, done.next.title);
        if (done.next.body !== before.body) emit(`body_i18n.${to}`, done.next.body);
        const changed = done.next.title !== before.title || done.next.body !== before.body;
        setGen((g) => ({ ...g, busy: false, failed: false, avail: "on", snap: done.snap, stale: done.held.length > 0 && (reason === "edit" || (g.stale && reason !== "manual")), note: changed ? t("sx.k07.gen.updated", { script: t(`sx.k07.gen.head.${to}`) }) : "" }));
      },
      (e: unknown) => {
        if (c.signal.aborted) return;
        if (isTranslitOff(e)) {
          setGen((g) => ({ ...g, busy: false, failed: false, avail: "off" }));
          return;
        }
        logApiError("studio.sx.k07.transliterate", e);
        setGen((g) => ({ ...g, busy: false, failed: true }));
      },
    );
  };
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const srcKey = `${source}\u0000${src.title}\u0000${src.body}`;
  const off = gen.avail === "off";
  const srcEmpty = textEmpty(src);
  useEffect(() => {
    if (readOnly || off || srcEmpty) return;
    if (firstKey.current === null) firstKey.current = srcKey;
    const reason = firstKey.current === srcKey ? "mount" : "edit";
    const timer = setTimeout(() => runRef.current(false, reason), WAIT_MS);
    return () => clearTimeout(timer);
  }, [srcKey, readOnly, off, srcEmpty]);

  const switchTo = (next: UzScript) => {
    if (next === source) return;
    ctrl.current?.abort();
    setGen((g) => ({ ...g, snap: EMPTY_SNAP, stale: false, busy: false, failed: false, note: "" }));
    emit("source_script", next);
  };

  const edited = editedParts(dst, gen.snap);
  const targetErr = !!errorAt(`title_i18n.${target}`) || !!errorAt(`body_i18n.${target}`);
  const shown = readOnly || targetErr || (open ?? off);
  const bodyId = `${id}-gen`;
  let status: string;
  if (off) status = "off";
  else if (gen.busy) status = "busy";
  else if (gen.failed) status = "failed";
  else if (srcEmpty) status = "idle";
  else if (edited.length && gen.stale) status = "stale";
  else if (edited.length) status = "edited";
  else if (textEmpty(dst)) status = "idle";
  else status = "auto";
  const canRegen = !readOnly && !off && !srcEmpty && !gen.busy && (status === "stale" || status === "edited" || status === "failed" || status === "idle");
  const scripts = [
    { value: "uz_latn" as const, label: t("sx.k07.script.uz_latn"), aiId: makeAiId(ai, "script", "uz-latn") },
    { value: "uz_cyrl" as const, label: t("sx.k07.script.uz_cyrl"), aiId: makeAiId(ai, "script", "uz-cyrl") },
  ];

  return (
    <>
      {readOnly ? null : <p className="sx-field__help sx-lg__lead">{t(off ? "sx.k07.uz.helpOff" : "sx.k07.uz.help")}</p>}
      <div className="sx-lg__switch">
        <span className="sx-lg__switchlabel" id={`${id}-script`}>
          {t("sx.k07.script.label")}
        </span>
        {readOnly ? (
          <span className="sx-lg__chip">{t(`sx.k07.script.${source}`)}</span>
        ) : (
          <SxSegmented<UzScript> items={scripts} value={source} onChange={switchTo} label={t("sx.k07.script.label")} size="sm" aiId={makeAiId(ai, "script")} />
        )}
      </div>
      <div className="sx-lg__src" data-script={source}>
        <PartEditors id={id} ai={ai} lang={source} text={src} readOnly={readOnly} errorAt={errorAt} emit={emit} touch={touch} required={!readOnly} />
      </div>
      <section className="sx-lg__gen" data-status={status} aria-labelledby={`${id}-gen-h`}>
        <div className="sx-lg__genhead">
          <div className="sx-lg__gentitles">
            <h4 className="sx-lg__genname" id={`${id}-gen-h`}>
              {t(`sx.k07.gen.head.${target}`)}
            </h4>
            {readOnly ? null : (
              <p className="sx-lg__genstate" role="status" aria-live="polite">
                {status === "busy" ? <span className="sx-spin" aria-hidden="true" /> : <span className="sx-lg__dot" aria-hidden="true" />}
                <span>{t(`sx.k07.gen.${status}`)}</span>
              </p>
            )}
          </div>
          {readOnly ? null : (
            <div className="sx-lg__genacts">
              {canRegen ? (
                <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => runRef.current(true, "manual")} aiId={makeAiId(ai, "regenerate")}>
                  {t(status === "failed" ? "sx.k07.gen.retry" : "sx.k07.gen.regen")}
                </SxButton>
              ) : null}
              <button
                type="button"
                className="sx-ibtn sx-lg__toggle"
                aria-expanded={shown}
                aria-controls={bodyId}
                aria-label={t(shown ? "sx.k07.gen.hide" : "sx.k07.gen.show")}
                title={t(shown ? "sx.k07.gen.hide" : "sx.k07.gen.show")}
                onClick={() => setOpen(!shown)}
                data-ai-id={makeAiId(ai, "toggle")}
                data-ai-type="button"
                data-ai-label={t(shown ? "sx.k07.gen.hide" : "sx.k07.gen.show")}
              >
                {glyph(ChevronDownIcon, { size: 18 })}
              </button>
            </div>
          )}
        </div>
        <div id={bodyId} className="sx-lg__genbody" hidden={!shown}>
          <PartEditors id={id} ai={ai} lang={target} text={dst} readOnly={readOnly} errorAt={errorAt} emit={emit} touch={touch} required={false} />
        </div>
        {gen.note ? <span className="sx-vh" aria-live="polite">{gen.note}</span> : null}
      </section>
    </>
  );
}

// The Russian or English tab: optional, but a title without its text (or
// the other way round) is never sent. Left empty, the language is simply
// not part of this version.
function TrailPanel({ id, ai, lang, readOnly, root, emit, errorAt, touch, schemaLangs }: PanelProps & { lang: TrailLang }): ReactElement {
  const t = useTranslations("studio");
  const text = textOf(root, lang);
  const state = stateOf(text);
  const [opened, setOpened] = useState(false);
  const hasErr = !!errorAt(`title_i18n.${lang}`) || !!errorAt(`body_i18n.${lang}`);
  const shown = opened || state !== "empty" || hasErr;
  const name = t(`sx.k07.lang.${lang}`);
  const gap = schemaLangs && schemaLangs.length > 0 && !schemaLangs.includes(lang) ? (
    <SxNote tone="warn" role="note" className="sx-lg__gap" title={t("sx.k07.gap.title", { lang: name })} action={<SxLinkButton variant="secondary" size="sm" href="/admin/legal" aiId={makeAiId(ai, lang, "gap", "legal")}>{t("sx.k07.gap.open")}</SxLinkButton>}>
      <p>{t("sx.k07.gap.text", { lang: name })}</p>
    </SxNote>
  ) : null;
  if (readOnly) {
    if (gap) return gap;
    return state === "empty" ? <p className="sx-lg__none">{t("sx.k07.trailNone", { lang: name })}</p> : <PartEditors id={id} ai={ai} lang={lang} text={text} readOnly errorAt={errorAt} emit={emit} touch={touch} required={false} />;
  }
  const clear = () => {
    if (text.title) emit(`title_i18n.${lang}`, "");
    if (text.body) emit(`body_i18n.${lang}`, "");
    setOpened(false);
  };
  return (
    <>
      {gap}
      <p className="sx-field__help sx-lg__lead">{t(`sx.k07.${lang}.help`)}</p>
      {shown ? (
        <>
          {state === "partial" ? (
            <p className="sx-lg__pair" role="status">
              <span className="sx-lg__dot" aria-hidden="true" />
              <span>{t("sx.k07.pairHint", { lang: name })}</span>
            </p>
          ) : null}
          <PartEditors id={id} ai={ai} lang={lang} text={text} readOnly={false} errorAt={errorAt} emit={emit} touch={touch} required={state !== "empty"} />
          <SxButton variant="ghost" size="sm" icon={XIcon} className="sx-lg__add" onClick={clear} aiId={makeAiId(ai, lang, "remove")}>
            {t("sx.k07.remove", { lang: name })}
          </SxButton>
        </>
      ) : (
        <SxButton variant="add" icon={PlusIcon} className="sx-lg__add" onClick={() => setOpened(true)} aiId={makeAiId(ai, lang, "add")}>
          {t(`sx.k07.${lang}.add`)}
        </SxButton>
      )}
    </>
  );
}

type TabMark = LangState | "error";

const MARK_ICON: Partial<Record<TabMark, typeof CheckIcon>> = { complete: CheckIcon };

// Uzbek, Russian and English, each on its own tab with a mark saying how far
// it is filled. A field error on a hidden tab opens it (focus.ts clicks the
// tab that controls the hidden panel).
export function LegalLangsBlock({ id, ai, label, help, required, readOnly, root, emit, errorAt, touch, schemaLangs }: LegalBlockProps): ReactElement {
  const t = useTranslations("studio");
  const [tab, setTab] = useState<LangTab>("uz");
  const list = useRef<HTMLDivElement>(null);
  const source = scriptOf(root.source_script);
  const langsOf = (l: LangTab): LegalLang[] => (l === "uz" ? [source, otherScript(source)] : [l]);
  const markOf = (l: LangTab): TabMark => (langsOf(l).some((x) => !!errorAt(`title_i18n.${x}`) || !!errorAt(`body_i18n.${x}`)) ? "error" : langState(root, l));
  const omission = readOnly ? null : omissionOf(root);
  const tabId = (l: LangTab) => `${id}-tab-${l}`;
  const panelId = (l: LangTab) => `${id}-panel-${l}`;
  const move = (e: KeyboardEvent<HTMLButtonElement>, from: LangTab) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const at = LANG_TABS.indexOf(from);
    const next = e.key === "Home" ? 0 : e.key === "End" ? LANG_TABS.length - 1 : (at + (e.key === "ArrowRight" ? 1 : LANG_TABS.length - 1)) % LANG_TABS.length;
    const to = LANG_TABS[next];
    setTab(to);
    requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>(`[data-tab="${to}"]`)?.focus());
  };
  const panel: PanelProps = { id, ai, readOnly, root, emit, errorAt, touch, schemaLangs };
  return (
    <fieldset className="sx-field sx-lg" data-as="fieldset" data-span={2} data-ro={readOnly ? "" : undefined} aria-describedby={help && !readOnly ? `${id}-help` : undefined} data-ai-id={ai} data-ai-type="section" data-ai-label={label}>
      <legend className="sx-field__label sx-field__legend" id={`${id}-label`}>
        {label}
        {required && !readOnly ? (
          <span className="sx-field__req" aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>
      {help && !readOnly ? (
        <p className="sx-field__help sx-lg__lead" id={`${id}-help`}>
          {help}
        </p>
      ) : null}
      <div className="sx-lg__tabs" role="tablist" aria-labelledby={`${id}-label`} ref={list} data-ai-id={makeAiId(ai, "tabs")} data-ai-type="tabs" data-ai-label={label}>
        {LANG_TABS.map((l) => {
          const on = l === tab;
          const mark = markOf(l);
          const icon = MARK_ICON[mark];
          const name = t(`sx.k07.lang.${l}`);
          return (
            <button
              key={l}
              type="button"
              role="tab"
              id={tabId(l)}
              aria-selected={on}
              aria-controls={panelId(l)}
              tabIndex={on ? 0 : -1}
              className="sx-lg__tab"
              data-tab={l}
              data-mark={mark}
              onClick={() => setTab(l)}
              onKeyDown={(e) => move(e, l)}
              data-ai-id={makeAiId(ai, "tab", l)}
              data-ai-type="tab"
              data-ai-label={name}
            >
              <span className="sx-lg__tabname">{name}</span>
              {l === "uz" && !readOnly ? (
                <span className="sx-lg__tabreq" aria-hidden="true">
                  *
                </span>
              ) : null}
              <span className="sx-lg__mark" aria-hidden="true">
                {icon ? glyph(icon, { size: 11, strokeWidth: 3 }) : null}
              </span>
              <span className="sx-vh">{t(`sx.k07.mark.${mark}`)}</span>
            </button>
          );
        })}
      </div>
      {omission ? (
        <SxNote tone={omission.kind === "removed" ? "warn" : "info"} role="status" className="sx-lg__omit" title={t(`sx.k07.omit.${omission.kind}Title`)}>
          {omission.langs.map((l) => (
            <p key={l} data-lang={l}>
              {t(`sx.k07.omit.${omission.kind}`, { lang: t(`sx.k07.lang.${l}`) })}
            </p>
          ))}
        </SxNote>
      ) : null}
      {LANG_TABS.map((l) => (
        <div key={l} role="tabpanel" id={panelId(l)} aria-labelledby={tabId(l)} className="sx-lg__panel" data-lang={l} hidden={l !== tab}>
          {l === "uz" ? <UzPanel {...panel} /> : <TrailPanel {...panel} lang={l} />}
        </div>
      ))}
    </fieldset>
  );
}
