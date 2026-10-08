"use client";

import { useId, useRef, useState } from "react";
import type { StudioFieldErrors } from "@/lib/services/studio";
import { STUDIO_ERR, type StudioEditorProps, type StudioPayload } from "./types";
import { ChipPick, ED_ERR, EdSection, EdShell, ErrLine, Fld, TagInput, TextIn, edAi, errIn, insertAt, normErrors, placeCaret, rec, slugify, str, strList, uniq, useEd, type Dict } from "./parts/kit";
import {
  IconAlert,
  IconBell,
  IconBolt,
  IconBriefcase,
  IconBuilding,
  IconChat,
  IconCheck,
  IconHeadset,
  IconLanguage,
  IconMail,
  IconPlus,
  IconScale,
  IconSend,
  IconShield,
  IconTag,
  IconUser,
} from "@/components/icons";

const CODE = "K14";
export const K14_LANGS = ["uz_latn", "uz_cyrl", "ru"] as const;
type Lang = (typeof K14_LANGS)[number];
const CHANNELS = [
  { value: "in_app", icon: IconBell },
  { value: "telegram", icon: IconSend },
  { value: "sms", icon: IconChat },
  { value: "email", icon: IconMail },
  { value: "push", icon: IconBolt },
];
const AUDIENCE = [
  { value: "client", icon: IconUser },
  { value: "lawyer", icon: IconBriefcase },
  { value: "jurist", icon: IconScale },
  { value: "organization", icon: IconBuilding },
  { value: "call_center", icon: IconHeadset },
  { value: "admin", icon: IconShield },
];
const EVENTS = [
  "order.created",
  "order.paid",
  "order.assigned",
  "order.completed",
  "order.cancelled",
  "payment.succeeded",
  "payment.failed",
  "document.ready",
  "consultation.scheduled",
  "consultation.reminder",
  "support.ticket_created",
  "support.ticket_answered",
];
const VAR_RE = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

function msgOf(messages: unknown, lang: Lang): { title: string; body: string } {
  const m = rec(messages);
  const o = rec(m[lang] ?? m[lang.replace("_", "-")] ?? (lang === "uz_latn" ? m.uz : undefined));
  return { title: str(o.title ?? o.subject), body: str(o.body ?? o.text ?? o.message) };
}

function usedVars(messages: unknown): string[] {
  const out: string[] = [];
  for (const l of K14_LANGS) {
    const m = msgOf(messages, l);
    for (const x of `${m.title} ${m.body}`.matchAll(VAR_RE)) out.push(x[1]);
  }
  return uniq(out);
}

export function emptyPayload(): StudioPayload {
  const blank = { title: "", body: "" };
  return { event: "", channels: ["in_app"], audience_roles: ["client"], variables: [], messages: { uz_latn: { ...blank }, uz_cyrl: { ...blank }, ru: { ...blank } } };
}

export function validate(payload: StudioPayload): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  if (!str(payload.event).trim()) out.event = STUDIO_ERR.required;
  if (!strList(payload.channels).length) out.channels = ED_ERR.minOne;
  for (const l of K14_LANGS) {
    const m = msgOf(payload.messages, l);
    if (!m.title.trim()) out[`messages.${l}.title`] = STUDIO_ERR.required;
    if (!m.body.trim()) out[`messages.${l}.body`] = STUDIO_ERR.required;
  }
  return out;
}

export default function K14Editor({ payload, onChange, errors, readOnly }: StudioEditorProps) {
  const { e, ctorName } = useEd();
  const uid = useId();
  const errs = normErrors(errors);
  const [lang, setLang] = useState<Lang>("uz_latn");
  const [target, setTarget] = useState<"title" | "body">("body");
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const variables = strList(payload.variables);
  const channels = strList(payload.channels);
  const audience = strList(payload.audience_roles);
  const cur = msgOf(payload.messages, lang);
  const missingVars = usedVars(payload.messages).filter((v) => !variables.includes(v));
  const set = (k: string, v: unknown) => onChange({ ...payload, [k]: v });

  function setMsg(l: Lang, p: Partial<{ title: string; body: string }>) {
    const all: Dict = {};
    for (const x of K14_LANGS) all[x] = msgOf(payload.messages, x);
    const keep = rec(payload.messages);
    const extra: Dict = {};
    for (const [k, v] of Object.entries(keep)) if (!(K14_LANGS as readonly string[]).includes(k) && k !== "uz" && !k.includes("-")) extra[k] = v;
    onChange({ ...payload, messages: { ...extra, ...all, [l]: { ...rec(keep[l]), ...msgOf(payload.messages, l), ...p } } });
  }

  function insertVar(v: string) {
    const token = `{{${v}}}`;
    if (target === "title") {
      const r = insertAt(titleRef.current, cur.title, token);
      setMsg(lang, { title: r.text });
      placeCaret(titleRef.current, r.caret);
    } else {
      const r = insertAt(bodyRef.current, cur.body, token);
      setMsg(lang, { body: r.text });
      placeCaret(bodyRef.current, r.caret);
    }
  }

  const langState = (l: Lang): "ok" | "bad" | "empty" => {
    const m = msgOf(payload.messages, l);
    if (errIn(errs, `messages.${l}`)) return "bad";
    if (m.title.trim() && m.body.trim()) return "ok";
    return m.title.trim() || m.body.trim() ? "bad" : "empty";
  };
  const done = K14_LANGS.filter((l) => langState(l) === "ok").length;
  const tErr = errs[`messages.${lang}.title`] ?? "";
  const bErr = errs[`messages.${lang}.body`] ?? "";
  const lErr = errs[`messages.${lang}`] ?? "";

  return (
    <EdShell code={CODE} icon={IconBell} title={ctorName(CODE)} lead={e("k14.lead")} payload={payload} errors={errs} known={["event", "channels", "audience_roles", "variables", "messages"]}>
      <div className="stu-fe-grid">
        <Fld id={`${uid}-ev`} label={e("k14.event")} required error={errs.event} hint={e("k14.eventHint")} wide>
          <TextIn id={`${uid}-ev`} value={str(payload.event)} onChange={(v) => set("event", v.trim())} readOnly={readOnly} invalid={Boolean(errs.event)} placeholder="order.created" label={e("k14.event")} ai={edAi(CODE, "event")} mono list={readOnly ? undefined : `${uid}-evs`} />
          {readOnly ? null : (
            <datalist id={`${uid}-evs`}>
              {EVENTS.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          )}
        </Fld>
        <Fld label={e("k14.channels")} required error={errs.channels} wide>
          <ChipPick options={CHANNELS.map((c) => ({ ...c, label: e(`k14.ch.${c.value}`) }))} value={channels} onChange={(v) => set("channels", v)} readOnly={readOnly} label={e("k14.channels")} ai={edAi(CODE, "channel")} invalid={Boolean(errs.channels)} />
        </Fld>
        <Fld label={e("k14.audience")} error={errs.audience_roles} hint={e("k14.audienceHint")} wide>
          <ChipPick options={AUDIENCE.map((c) => ({ ...c, label: e(`k14.aud.${c.value}`) }))} value={audience} onChange={(v) => set("audience_roles", v)} readOnly={readOnly} label={e("k14.audience")} ai={edAi(CODE, "audience")} invalid={Boolean(errs.audience_roles)} />
        </Fld>
      </div>

      <EdSection icon={IconTag} title={e("k14.variables")} hint={e("k14.variablesHint")} count={variables.length} error={errs.variables}>
        <TagInput value={variables} onChange={(v) => set("variables", v)} readOnly={readOnly} label={e("k14.variables")} placeholder={e("k14.variablesPh")} ai={edAi(CODE, "variables")} normalize={slugify} mono />
        {missingVars.length ? (
          <div className="stu-fe-warn" role="status">
            <IconAlert aria-hidden />
            <span>
              {e("k14.missingVars")} {missingVars.map((v) => `{{${v}}}`).join(", ")}
            </span>
            {readOnly ? null : (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => set("variables", uniq([...variables, ...missingVars]))} data-ai-id={edAi(CODE, "variables", "add-missing")} data-ai-type="button" data-ai-label={e("k14.addMissing")}>
                <IconPlus aria-hidden />
                {e("k14.addMissing")}
              </button>
            )}
          </div>
        ) : null}
      </EdSection>

      <EdSection
        icon={IconLanguage}
        title={e("k14.messages")}
        hint={e("k14.messagesHint")}
        error={errs.messages}
        actions={
          <span className={`stu-fe-prog${done === K14_LANGS.length ? " ok" : ""}`}>
            <IconCheck aria-hidden />
            {e("k14.progress", { n: done, total: K14_LANGS.length })}
          </span>
        }
      >
        <div className="stu-fe-ltabs" role="tablist" aria-label={e("k14.messages")}>
          {K14_LANGS.map((l) => {
            const st = langState(l);
            return (
              <button
                key={l}
                type="button"
                role="tab"
                id={`${uid}-tab-${l}`}
                aria-selected={lang === l}
                aria-controls={`${uid}-panel`}
                className={`stu-fe-ltab is-${st}${lang === l ? " on" : ""}`}
                onClick={() => setLang(l)}
                data-ai-id={edAi(CODE, "lang", l)}
                data-ai-type="tab"
                data-ai-label={e(`k14.lang.${l}`)}
              >
                <span>{e(`k14.lang.${l}`)}</span>
                <i className="stu-fe-ltab__m" aria-label={e(`k14.state.${st}`)}>
                  {st === "ok" ? <IconCheck aria-hidden /> : st === "bad" ? "!" : ""}
                </i>
              </button>
            );
          })}
        </div>
        <div className="stu-fe-lpanel" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${lang}`}>
          <ErrLine msg={lErr} />
          <Fld id={`${uid}-t`} label={e("k14.msgTitle")} required error={tErr}>
            <input
              ref={titleRef}
              id={`${uid}-t`}
              type="text"
              value={cur.title}
              onChange={(ev) => setMsg(lang, { title: ev.target.value })}
              onFocus={() => setTarget("title")}
              readOnly={readOnly}
              placeholder={e(`k14.titlePh.${lang}`)}
              autoComplete="off"
              aria-invalid={Boolean(tErr) || undefined}
              data-ai-id={edAi(CODE, "message", lang, "title")}
              data-ai-type="input"
              data-ai-label={e("k14.msgTitle")}
            />
          </Fld>
          <Fld id={`${uid}-b`} label={e("k14.msgBody")} required error={bErr}>
            <textarea
              ref={bodyRef}
              id={`${uid}-b`}
              value={cur.body}
              onChange={(ev) => setMsg(lang, { body: ev.target.value })}
              onFocus={() => setTarget("body")}
              readOnly={readOnly}
              rows={5}
              placeholder={e(`k14.bodyPh.${lang}`)}
              aria-invalid={Boolean(bErr) || undefined}
              data-ai-id={edAi(CODE, "message", lang, "body")}
              data-ai-type="textarea"
              data-ai-label={e("k14.msgBody")}
            />
          </Fld>
          {readOnly ? null : variables.length ? (
            <div className="stu-fe-ins" role="group" aria-label={e("k14.insert")}>
              <span className="stu-fe-ins__l">{target === "title" ? e("k14.insertTitle") : e("k14.insertBody")}</span>
              {variables.map((v) => (
                <button key={v} type="button" className="stu-fe-ins__b" onMouseDown={(ev) => ev.preventDefault()} onClick={() => insertVar(v)} data-ai-id={edAi(CODE, "insert", v)} data-ai-type="button" data-ai-label={`{{${v}}}`}>
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          ) : (
            <p className="stu-hint">{e("k14.insertNone")}</p>
          )}
        </div>
      </EdSection>
    </EdShell>
  );
}
