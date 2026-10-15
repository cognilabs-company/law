"use client";

import { useMemo, useState, type ComponentType, type CSSProperties, type KeyboardEvent, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import { asDict, asStr } from "@/lib/http";
import { createOrgUnit, updateOrgUnit, type OrgBoard } from "@/lib/services/internalHrm";
import Modal from "@/components/admin/Modal";
import { apiMessage } from "@/components/internal/live/bits";
import { IconBuilding, IconClose, IconGrid, IconLayers, IconMapPin, IconPlus, IconSearch, IconUsers } from "@/components/icons";
import { EntitySelect, HrmAvatar, HrmError } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { TYPE_COLOR } from "./OrgWhiteboard";

export const UNIT_TYPES = ["company", "department", "team", "branch", "division"] as const;
const TYPE_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = { company: IconBuilding, department: IconLayers, team: IconUsers, branch: IconMapPin, division: IconGrid };
const PICKS = 6;

// A new unit (under parentId), a copy of one (copyOf), or one put in between
// a unit and its parent (above).
export type UnitCreateState = { parentId: string; copyOf?: string; above?: string };

// MedControl HR's «Yangi karta»: the type as a row of coloured choices, the
// name, where it hangs, and who heads it, found by name — instead of a form
// of selects. Editing a unit stays in the drawer.
export default function OrgUnitCreate({ state, board, onClose, onSaved }: { state: UnitCreateState | null; board: OrgBoard; onClose: () => void; onSaved: () => void }) {
  if (!state) return null;
  return <CreateDialog key={`${state.parentId}|${state.copyOf ?? ""}|${state.above ?? ""}`} state={state} board={board} onClose={onClose} onSaved={onSaved} />;
}

function CreateDialog({ state, board, onClose, onSaved }: { state: UnitCreateState; board: OrgBoard; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("internal.people");
  const tc = useTranslations("internal.people.newCard");
  const tu = useTranslations("internal.ui");
  const dir = useHrmDirectory();
  const nodeOf = (id: string) => board.nodes.find((n) => n.entityId === id && n.type !== "employee");
  const typeOf = (id: string) => dir.unit(id)?.type || asStr(nodeOf(id)?.raw.unit_type);
  const nameOf = (id: string) => dir.unitName(id) || nodeOf(id)?.label || "";

  const [initial] = useState(() => {
    if (state.copyOf) {
      const name = nameOf(state.copyOf);
      return { type: typeOf(state.copyOf) || "department", name: name ? t("board.menu.copyNamed", { name }) : "", parent: dir.unit(state.copyOf)?.parentId || nodeOf(state.copyOf)?.parentId.replace(/^unit:/, "") || "" };
    }
    const parentType = state.parentId ? typeOf(state.parentId) : "";
    return { type: !state.parentId && !state.above ? "company" : parentType === "company" ? "department" : "team", name: "", parent: state.parentId };
  });
  const [type, setType] = useState(initial.type);
  const [name, setName] = useState(initial.name);
  const [code, setCode] = useState("");
  const [parent, setParent] = useState(initial.parent);
  const [head, setHead] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needle = q.trim().toLocaleLowerCase();
  const matches = useMemo(
    () => (needle ? dir.employees.filter((e) => e.status !== "terminated" && `${e.name} ${e.code} ${e.phone}`.toLocaleLowerCase().includes(needle)).slice(0, PICKS) : []),
    [dir.employees, needle],
  );
  const picked = head ? dir.employee(head) : undefined;
  const subOf = (id: string) => {
    const e = dir.employee(id);
    return e ? [dir.positionTitle(e.positionId), dir.unitName(e.unitId)].filter(Boolean).join(" · ") : "";
  };

  const where = state.above
    ? tc("above", { name: nameOf(state.above) })
    : state.copyOf
      ? tc("copyOf", { name: nameOf(state.copyOf) })
      : parent
        ? tc("under", { parent: nameOf(parent) })
        : tc("root");

  const onTypeKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = UNIT_TYPES[(i + step + UNIT_TYPES.length) % UNIT_TYPES.length];
    setType(next);
    (e.currentTarget.parentElement?.querySelector(`[data-type="${next}"]`) as HTMLElement | null)?.focus();
  };

  async function submit() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = asDict(await createOrgUnit({ name: name.trim(), code: code.trim(), unit_type: type, parent_id: parent || null, head_employee_id: head || null, status: "active", meta: {} }));
      const newId = asStr(created.id) || asStr(asDict(created.unit).id);
      // In between: the unit it was put above now hangs under it.
      if (state.above && newId) await updateOrgUnit(state.above, { parent_id: newId });
      onSaved();
    } catch (cause) {
      // The backend's own reason (a duplicate code, no right to this branch).
      setError(apiMessage(cause, t("saveError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      dirty={Boolean(name.trim() && name !== initial.name) || Boolean(code.trim() || head)}
      title={state.above ? t("board.menu.addAbove") : state.copyOf ? t("board.menu.duplicate") : tc("title")}
      description={where}
      aiId="internal.org.create-unit"
      footer={
        <>
          <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy}>{tc("cancel")}</button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => void submit()} disabled={busy || !name.trim()}>
            <IconPlus />
            {busy ? t("saving") : t("create")}
          </button>
        </>
      }
    >
      <form
        className="ocu"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {error ? <HrmError text={error} /> : null}
        <div className="ocu__types" role="radiogroup" aria-label={tc("type")}>
          {UNIT_TYPES.map((x, i) => {
            const Ico = TYPE_ICON[x];
            const on = x === type;
            return (
              <button
                key={x}
                type="button"
                role="radio"
                data-type={x}
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                className={`ocu__type${on ? " is-on" : ""}`}
                style={{ "--c": TYPE_COLOR[x] } as CSSProperties}
                onClick={() => setType(x)}
                onKeyDown={(e) => onTypeKey(e, i)}
              >
                <span className="ocu__dot" aria-hidden><Ico /></span>
                <span>{tu(`unitType.${x}`)}</span>
              </button>
            );
          })}
        </div>

        <div className="ocu__row">
          <label className="internal-field">
            <span className="internal-field__label">{tc("name")} <b className="ocu__req" aria-hidden>*</b></span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required autoFocus placeholder={tc("namePh")} />
          </label>
          <label className="internal-field">
            <span className="internal-field__label">{tc("code")}</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={50} placeholder="DEP-001" />
            <small className="internal-field__hint">{tc("codeHint")}</small>
          </label>
        </div>

        {state.copyOf || state.above ? null : (
          <div className="internal-field">
            <span className="internal-field__label">{tc("parent")}</span>
            <EntitySelect value={parent} onChange={setParent} options={dir.unitOptions} placeholder={tc("rootOption")} ariaLabel={tc("parent")} />
          </div>
        )}

        <div className="internal-field">
          <span className="internal-field__label" id="ocu-head">{type === "team" ? tc("teamLead") : tc("head")}</span>
          {picked ? (
            <div className="ocu__picked">
              <HrmAvatar name={picked.name} size="sm" />
              <span>
                <b>{picked.name}</b>
                <small>{subOf(picked.id) || picked.code}</small>
              </span>
              <button type="button" onClick={() => setHead("")} aria-label={tc("clearHead")} title={tc("clearHead")}><IconClose /></button>
            </div>
          ) : (
            <div className="ocu__pick">
              <div className="uf-search ocu__q">
                <IconSearch aria-hidden />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tc("headSearch")} aria-labelledby="ocu-head" maxLength={80} />
              </div>
              {needle ? (
                <ul className="ocu__list" role="listbox" aria-labelledby="ocu-head">
                  {matches.length ? matches.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => {
                          setHead(e.id);
                          setQ("");
                        }}
                      >
                        <HrmAvatar name={e.name} size="sm" />
                        <span>
                          <b>{e.name}</b>
                          <small>{subOf(e.id) || e.code}</small>
                        </span>
                      </button>
                    </li>
                  )) : <li className="ocu__none">{tc("noPeople")}</li>}
                </ul>
              ) : (
                <small className="internal-field__hint">{tc("headHint")}</small>
              )}
            </div>
          )}
        </div>
        {type === "team" ? <p className="ocu__note">{tc("membersHint")}</p> : null}
      </form>
    </Modal>
  );
}
