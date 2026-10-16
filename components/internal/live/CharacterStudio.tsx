"use client";

import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { saveLiveCharacter } from "@/lib/services/internalLive";
import Modal from "@/components/admin/Modal";
import { IconCheck, IconRefresh, IconSparkle, IconUsers } from "@/components/icons";
import { HrmError } from "@/components/internal/HrmUi";
import CharacterArt, { backdropOf, type ArtView } from "./CharacterArt";
import { GROUPS, OPTION_COUNT, PARTS, PRESETS, SWATCH, hidden, randomLook, storedLook, type Look, type Part } from "./character";
import { apiMessage, useLiveText } from "./bits";

// Which part of the figure each choice is shown on; the rest on the head
// and shoulders.
const VIEW_OF: Partial<Record<Part, ArtView>> = { body: "full", extra: "full", top: "torso", bottom: "legs", shoes: "feet" };
type Tab = "ready" | (typeof GROUPS)[number]["id"];

// Moving between the choices of one group with the arrow keys, as a radio
// group does; the chosen one is the only stop for Tab.
function roving(e: KeyboardEvent<HTMLElement>) {
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  const all = [...(e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]:not(:disabled)") ?? [])];
  const at = all.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  e.preventDefault();
  const next = all[(at + step + all.length) % all.length];
  next.focus();
  next.click();
}

// The character studio: an admin picks one of the 30 ready characters for
// a person, or dresses one part by part, watching the figure change.
export default function CharacterStudio({ person, look: start, preset: startPreset, onClose, onSaved }: { person: { id: string; name: string }; look: Look; preset: string; onClose: () => void; onSaved: (look: Look) => void }) {
  const { t } = useLiveText();
  const [look, setLook] = useState<Look>(start);
  const [preset, setPreset] = useState(startPreset);
  const [tab, setTab] = useState<Tab>("ready");
  const [sex, setSex] = useState<"" | "m" | "f">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty = JSON.stringify(look) !== JSON.stringify(start);
  const set = <K extends Part>(k: K, v: Look[K]) => setLook((l) => ({ ...l, [k]: v }));
  const opt = (part: Part, v: string) => (t.has(`avatar.opt.${part}.${v}`) ? t(`avatar.opt.${part}.${v}`) : v);

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await saveLiveCharacter(person.id, storedLook(look, preset));
      onSaved(look);
    } catch (cause) {
      setErr(apiMessage(cause, t("avatar.saveError")));
    } finally {
      setBusy(false);
    }
  }

  const group = GROUPS.find((g) => g.id === tab);
  const shown = PRESETS.filter((p) => !sex || p.look.body === sex);
  const isOn = (p: (typeof PRESETS)[number]) => preset === p.id && JSON.stringify(p.look) === JSON.stringify(look);
  const stop = (shown.find(isOn) ?? shown[0])?.id;

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      dirty={dirty}
      size="xl"
      title={t("avatar.title")}
      description={t("avatar.lead", { name: person.name })}
      aiId="internal.live.character-studio"
      footer={
        <>
          <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy}>{t("cancel")}</button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => void save()} disabled={busy || !dirty}>
            <IconCheck />
            {busy ? t("saving") : t("save")}
          </button>
        </>
      }
    >
      <div className="chs">
        <figure className="chs__stage" style={{ "--chs-bg": backdropOf(look) } as CSSProperties}>
          <CharacterArt key={JSON.stringify(look)} look={look} title={t("avatar.preview", { name: person.name })} className="chr chs__fig" />
          <figcaption>
            <b>{person.name}</b>
            <span>{t("avatar.count", { n: PRESETS.length, m: OPTION_COUNT })}</span>
          </figcaption>
          <div className="chs__tools">
            <button type="button" className="lf-btn" onClick={() => setLook(randomLook())}>
              <IconSparkle />
              {t("avatar.random")}
            </button>
            <button type="button" className="lf-btn" onClick={() => setLook(start)} disabled={!dirty}>
              <IconRefresh />
              {t("avatar.reset")}
            </button>
          </div>
        </figure>

        <div className="chs__panel">
          {err ? <HrmError text={err} /> : null}
          <div className="hrm-tabs chs__tabs" role="tablist" aria-label={t("avatar.title")}>
            {(["ready", ...GROUPS.map((g) => g.id)] as Tab[]).map((x) => (
              <button key={x} type="button" role="tab" aria-selected={tab === x} className={tab === x ? "on" : ""} onClick={() => setTab(x)}>
                {x === "ready" ? <IconUsers /> : null}
                {t(`avatar.tab.${x}`)}
              </button>
            ))}
          </div>

          {tab === "ready" ? (
            <div className="chs__ready" role="tabpanel">
              <div className="lv-view chs__sex" role="group" aria-label={t("avatar.opt.body.label")}>
                {(["", "m", "f"] as const).map((s) => (
                  <button key={s || "all"} type="button" className={sex === s ? "on" : ""} aria-pressed={sex === s} onClick={() => setSex(s)}>
                    {s ? t(`avatar.opt.body.${s}`) : t("avatar.all")}
                    <small>{s ? 15 : 30}</small>
                  </button>
                ))}
              </div>
              <div className="chs__presets" role="radiogroup" aria-label={t("avatar.tab.ready")} onKeyDown={roving}>
                {shown.map((p) => {
                  const on = isOn(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={p.id === stop ? 0 : -1}
                      className={`chs__preset${on ? " is-on" : ""}`}
                      onClick={() => {
                        setPreset(p.id);
                        setLook(p.look);
                      }}
                    >
                      <span style={{ background: backdropOf(p.look) }}>
                        <CharacterArt look={p.look} variant="bust" />
                      </span>
                      <b>{p.name}</b>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : group ? (
            <div className="chs__parts" role="tabpanel">
              {group.parts.map((part) => (
                <PartPicker key={part} part={part} look={look} label={t(`avatar.part.${part}`)} off={hidden(look, part) ? t(`avatar.hiddenBy.${part}`) : ""} name={(v) => opt(part, v)} onPick={(v) => set(part, v as Look[typeof part])} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function PartPicker({ part, look, label, off, name, onPick }: { part: Part; look: Look; label: string; off: string; name: (v: string) => string; onPick: (v: string) => void }) {
  const colors = SWATCH[part];
  const values = PARTS[part] as readonly string[];
  const id = `chs-${part}`;
  const current = look[part] as string;
  let body: ReactNode;
  if (colors) {
    body = values.map((v) => (
      <button key={v} type="button" role="radio" aria-checked={current === v} tabIndex={current === v ? 0 : -1} aria-label={name(v)} title={name(v)} className={`chs__sw${current === v ? " is-on" : ""}`} style={{ background: colors[v] }} disabled={!!off} onClick={() => onPick(v)} />
    ));
  } else {
    const view = VIEW_OF[part] ?? "bust";
    const whole = view === "full";
    body = values.map((v) => (
      <button key={v} type="button" role="radio" aria-checked={current === v} tabIndex={current === v ? 0 : -1} title={name(v)} className={`chs__opt${whole ? " chs__opt--whole" : ""}${current === v ? " is-on" : ""}`} disabled={!!off} onClick={() => onPick(v)}>
        <span>
          <CharacterArt look={{ ...look, [part]: v }} variant={view} />
        </span>
        <small>{name(v)}</small>
      </button>
    ));
  }
  return (
    <section className={`chs__part${off ? " is-off" : ""}`}>
      <h4 id={id}>
        {label}
        <span>{values.length}</span>
      </h4>
      {off ? <p className="chs__off">{off}</p> : null}
      <div className={colors ? "chs__sws" : "chs__opts"} role="radiogroup" aria-labelledby={id} onKeyDown={roving}>
        {body}
      </div>
    </section>
  );
}
