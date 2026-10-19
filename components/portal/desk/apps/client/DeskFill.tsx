"use client";

import { useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { DocChromeContext, aiFieldValue, aiFillable, aiRowId, type DocFillRefs, type DocFillView } from "@/components/portal/DocFill";
import { MAX_DIGITS, fieldKind, isFilled, isoDate, sanitizeInput, type DocField, type DocKind } from "@/lib/docTemplate";
import { formatUzSubscriber, uzSubscriber } from "@/lib/phone";
import { fmtUzs } from "@/lib/money";
import { useAiField } from "@/lib/ai/registry";
import { IconCheck, IconClock, IconClose, IconHeadset, IconInfo, IconList } from "@/components/icons";
import { Banner, Btn, Progress, Select, Seg, Tool, Toolbar } from "../../kit/kit";
import { DateField } from "../../kit/pickers";

// The document builder's fill screen as a desktop program — Pages' or
// Word's window with the form as an inspector: the questions on the left
// in their sections, the document filling in live in the middle on its
// page, and on the right the sections with their progress and the
// document's details. "Generate" sits in the toolbar. Everything it does
// is DocFill's (a skin, see DocFillView); this only lays it out.

export default function DeskFill({ v, refs }: { v: DocFillView; refs: DocFillRefs }) {
  const t = useTranslations("portal.client.documents");
  const tc = useTranslations("cta");
  const chrome = useContext(DocChromeContext);
  const { formPane, bind } = refs;
  const [side, setSide] = useState<"sections" | "info" | "">("sections");
  const status = v.touched && v.blocked ? t("missingN", { n: v.missing.length }) : v.total > 0 && v.done === v.total ? t("allFilled") : v.total > 0 && !v.blocked ? t("requiredDone", { n: v.total - v.done }) : "";

  return (
    <div className="dxfl">
      <Toolbar
        title={v.title}
        subtitle={`${t("filledOf", { done: v.done, total: v.total })}${v.hasDraft ? ` · ${t("wsDraftSaved")}` : ""}`}
        back={chrome ? { label: tc("back"), onClick: chrome.onBack } : undefined}
        end={
          <Btn kind="primary" icon={<IconCheck />} busy={v.busy} onClick={v.submit}>
            {v.submitLabel}
          </Btn>
        }
      >
        {v.ask.available ? <Tool icon={v.ask.sent ? <IconCheck /> : <IconHeadset />} label={v.ask.sent ? t("askLawyerSent") : t("askLawyer")} onClick={v.ask.run} disabled={v.ask.busy || v.ask.sent || !!v.ask.heldNote} /> : null}
        <Tool icon={<IconList />} label={t("wsTogglePanel")} active={!!side} onClick={() => setSide((s) => (s ? "" : "sections"))} />
        {chrome ? <Tool icon={<IconClose />} label={t("exit")} onClick={chrome.onExit} /> : null}
      </Toolbar>
      <div className={`dxfl-body${side ? " has-side" : ""}`}>
        <aside className="dxfl-form" aria-label={t("tabForm")}>
          <div className="dxfl-form__head">
            <Progress value={v.pct} label={`${v.pct}%`} />
            <p>{t("fillLead")}</p>
            {v.ask.err ? <Banner tone="err">{t("askLawyerError")}</Banner> : null}
            {v.ask.gated ? <Banner tone="info">{v.ask.gated}</Banner> : null}
            {v.ask.heldNote ? <Banner tone="info">{v.ask.heldNote}</Banner> : null}
          </div>
          <div className="dxfl-list dx-scroll" ref={formPane}>
            {v.total === 0 ? <p className="dxcs-lead">{t("noFields")}</p> : null}
            {v.groups.map((g, gi) => (
              <section key={gi} className="dxfl-group">
                {g.title ? <h3>{g.title}</h3> : null}
                {g.items.map((f) => (
                  <Row key={f.name} f={f} v={v} bind={bind} />
                ))}
              </section>
            ))}
          </div>
          <footer className="dxfl-form__foot" role="status">
            {status ? <span className={v.touched && v.blocked ? "is-bad" : "is-ok"}>{status}</span> : null}
            {v.serverMissing.length ? <span className="is-bad">{t("missingServer")}</span> : null}
            <small>
              <IconClock aria-hidden /> {t("wizAutosave")}
            </small>
          </footer>
        </aside>
        <main className="dxfl-page dx-scroll" aria-label={t("tabDoc")}>
          {v.paper}
        </main>
        {side ? (
          <aside className="dxfl-side" aria-label={t("wsTabSections")}>
            <Seg<"sections" | "info">
              small
              label={t("wsTogglePanel")}
              value={side}
              onChange={setSide}
              items={[
                { id: "sections", label: t("wsTabSections"), icon: <IconList /> },
                { id: "info", label: t("wsTabInfo"), icon: <IconInfo /> },
              ]}
            />
            {side === "sections" ? (
              <ul className="dxfl-secs">
                {v.groups.map((g, gi) => {
                  const n = g.items.length;
                  const d = g.items.filter((f) => isFilled(fieldKind(f), v.answers[f.name])).length;
                  const target = g.items.find((f) => !isFilled(fieldKind(f), v.answers[f.name])) ?? g.items[0];
                  return (
                    <li key={gi}>
                      <button type="button" className={n && d === n ? "is-done" : ""} onClick={() => target && v.focusField(target.name)}>
                        <i aria-hidden>{n && d === n ? <IconCheck /> : gi + 1}</i>
                        <span>
                          <b>{g.title || t("wsAllFields")}</b>
                          <small>{t("wsSecCount", { done: d, total: n })}</small>
                          <em aria-hidden>
                            <span style={{ width: `${n ? Math.round((d / n) * 100) : 0}%` }} />
                          </em>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <dl className="dxfl-info">
                <div>
                  <dt>{t("wsDocLabel")}</dt>
                  <dd>{v.title}</dd>
                </div>
                <div>
                  <dt>{t("price")}</dt>
                  <dd>{v.req.price ? `${fmtUzs(v.req.price)} ${t("som")}` : t("free")}</dd>
                </div>
                <div>
                  <dt>{t("wsFieldsLabel")}</dt>
                  <dd>{t("wsFieldsValue", { total: v.total, required: v.requiredN })}</dd>
                </div>
                <div>
                  <dt>{t("wsHelpTitle")}</dt>
                  <dd>{t("wsHelpLead")}</dd>
                </div>
                {v.ask.available ? (
                  <Btn icon={<IconHeadset />} busy={v.ask.busy} disabled={v.ask.sent || !!v.ask.heldNote} onClick={v.ask.run}>
                    {v.ask.sent ? t("askLawyerSent") : t("askLawyer")}
                  </Btn>
                ) : null}
              </dl>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

// One question: its label (which also finds its place on the page), the
// control its kind asks for, and what is wrong or what it adds up to.
function Row({ f, v, bind }: { f: DocField; v: DocFillView; bind: DocFillRefs["bind"] }) {
  const t = useTranslations("portal.client.documents");
  const kind: DocKind = fieldKind(f);
  const label = v.label(f);
  const value = v.answers[f.name] ?? "";
  const shown = v.values[f.name] ?? "";
  const err = v.touched && !!f.required && !isFilled(kind, value);
  const on = v.active === f.name;
  const count = v.counts[f.name] ?? 0;
  useAiField(aiFillable(f, kind) ? aiRowId(f.name) : "", {
    get: () => value,
    set: (raw) => {
      const next = aiFieldValue(f, kind, raw);
      if (next !== null) v.aiSetVal(f.name, next);
    },
    sensitive: true,
    fillable: true,
  });
  const set = (x: string) => v.setVal(f, x);
  const focus = () => {
    v.jump(f.name);
    setTimeout(() => v.scrollIntoPane(f.name), 300);
  };
  const blur = () => v.setActive("");
  const ph = t("enterField", { label });
  const hint = f.hint && f.hint.trim().toLowerCase() !== label.trim().toLowerCase() ? f.hint : "";
  return (
    <div className={`dxfl-row${on ? " is-on" : ""}${err ? " is-bad" : ""}${shown ? " is-done" : ""}`}>
      <button type="button" className="dxfl-row__l" onClick={() => v.jump(f.name)} title={t("jumpToSpot")}>
        <span>
          {label}
          {f.required ? <i aria-hidden> *</i> : null}
        </span>
        {count > 1 ? <em title={t("occursTimes", { n: count })}>×{count}</em> : null}
        {shown ? <IconCheck aria-hidden /> : null}
      </button>
      {kind === "multiline" ? (
        <textarea className="dx-in dx-in--area" ref={(el) => bind(f.name, el)} rows={3} value={value} placeholder={ph} aria-label={label} onFocus={focus} onBlur={blur} onChange={(e) => set(sanitizeInput(kind, e.target.value))} />
      ) : kind === "date" ? (
        <div tabIndex={-1} ref={(el) => bind(f.name, el)} onFocus={focus} onBlur={blur}>
          <DateField value={isoDate(value)} onChange={set} ariaLabel={label} placeholder={ph} clearable />
        </div>
      ) : kind === "select" ? (
        <div tabIndex={-1} ref={(el) => bind(f.name, el)} onFocus={focus} onBlur={blur}>
          <Select value={value} onChange={set} ariaLabel={label} options={[{ value: "", label: ph }, ...(f.options || []).map((o) => ({ value: o, label: o }))]} />
        </div>
      ) : kind === "phone" ? (
        <span className="dxfl-phone">
          <span>+998</span>
          <input
            className="dx-in"
            ref={(el) => bind(f.name, el)}
            type="tel"
            inputMode="tel"
            placeholder="90 123 45 67"
            aria-label={label}
            value={formatUzSubscriber(value)}
            onFocus={focus}
            onBlur={blur}
            onChange={(e) => {
              const d = uzSubscriber(e.target.value);
              set(d ? `+998 ${formatUzSubscriber(d)}` : "");
            }}
          />
        </span>
      ) : (
        <input
          className="dx-in"
          ref={(el) => bind(f.name, el)}
          type={kind === "email" ? "email" : "text"}
          inputMode={kind === "money" || kind === "number" || kind === "pinfl" || kind === "inn" ? "numeric" : kind === "email" ? "email" : undefined}
          maxLength={MAX_DIGITS[kind]}
          value={value}
          placeholder={ph}
          aria-label={label}
          onFocus={focus}
          onBlur={blur}
          onChange={(e) => set(sanitizeInput(kind, e.target.value))}
        />
      )}
      {err ? <small className="dx-field__e">{t("wizRequired")}</small> : kind === "money" && shown ? <small className="dx-field__h">{`${shown} ${t("som")}`}</small> : hint ? <small className="dx-field__h">{hint}</small> : null}
    </div>
  );
}
