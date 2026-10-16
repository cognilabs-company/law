"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import Select from "@/components/Select";
import type { SearchOption } from "@/components/SearchSelect";
import InternalField from "@/components/internal/InternalField";
import {
  MEMBERSHIP_TYPES,
  createGrant,
  createRegistryRule,
  getActivityRegistry,
  getLiveRooms,
  getMemberships,
  revokeGrant,
  saveMembership,
  type LiveGrant,
  type LiveMembership,
  type LiveRoom,
  type RegistryRule,
} from "@/lib/services/internalLive";
import { IconBuilding, IconCheck, IconClock, IconEdit, IconLayers, IconList, IconLock, IconPlus, IconSearch, IconUsers } from "@/components/icons";
import { EntitySelect, HrmDrawer, HrmEmpty, HrmError, HrmLoading, HrmPanel, HrmStatus, useHrmFormat, useNow } from "@/components/internal/HrmUi";
import { ReasonModal, apiMessage, dayIso, zonedIso, useLiveText } from "./bits";
import RoomBuilder from "./RoomBuilder";
import CharacterArt, { backdropOf } from "./CharacterArt";
import { OPTION_COUNT, PRESETS, type Look } from "./character";

type Section = "rooms" | "characters" | "memberships" | "grants" | "registry";
type Cast = { lookOf: (id: string) => Look; onDress: (person: { id: string; name: string }) => void };
type Opts = { unitOptions: SearchOption[]; employeeOptions: SearchOption[]; userOptions: SearchOption[]; unitName: (id: string) => string };

// Admin side of the Live Office: rooms per unit (§8), each person's primary
// and additional department (§8), temporary monitoring access (§13) and the
// activity registry that turns request paths into readable actions (§21).
export default function LiveSettings({ opts, grants, onChanged, cast }: { opts: Opts; grants: LiveGrant[]; onChanged: () => void; cast: Cast }) {
  const { t } = useLiveText();
  const [section, setSection] = useState<Section>("rooms");
  return (
    <div className="lv-set">
      <div className="hrm-tabs lv-set__tabs" role="tablist" aria-label={t("settings.title")}>
        {(["rooms", "characters", "memberships", "grants", "registry"] as Section[]).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={section === s} className={section === s ? "on" : ""} onClick={() => setSection(s)}>
            {t(`settings.${s}`)}
          </button>
        ))}
      </div>
      {section === "rooms" ? <Rooms opts={opts} onChanged={onChanged} /> : section === "characters" ? <Characters opts={opts} cast={cast} /> : section === "memberships" ? <Memberships opts={opts} onChanged={onChanged} /> : section === "grants" ? <Grants opts={opts} known={grants} /> : <Registry opts={opts} />}
    </div>
  );
}

// ── Characters ──────────────────────────────────────────────────────────────

// Everyone with their Live Office character, to dress one after another.
function Characters({ opts, cast }: { opts: Opts; cast: Cast }) {
  const { t } = useLiveText();
  const [q, setQ] = useState("");
  const needle = q.trim().toLocaleLowerCase();
  const list = opts.employeeOptions.filter((o) => !needle || `${o.label} ${o.sub ?? ""}`.toLocaleLowerCase().includes(needle));
  return (
    <HrmPanel
      title={t("settings.characters")}
      icon={IconUsers}
      count={opts.employeeOptions.length}
      actions={
        <div className="uf-search lv-cast__q">
          <IconSearch aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("avatar.search")} aria-label={t("avatar.search")} maxLength={80} />
        </div>
      }
    >
      <p className="hrm-muted lv-cast__lead">{t("avatar.settingsLead", { n: PRESETS.length, m: OPTION_COUNT })}</p>
      {list.length ? (
        <ul className="lv-cast">
          {list.map((o) => {
            const look = cast.lookOf(o.value);
            return (
              <li key={o.value}>
                <span className="lv-cast__av" style={{ background: backdropOf(look) }} aria-hidden>
                  <CharacterArt look={look} variant="bust" />
                </span>
                <span className="lv-cast__t">
                  <b>{o.label}</b>
                  {o.sub ? <small>{o.sub}</small> : null}
                </span>
                <button type="button" className="btn btn--line btn--sm" onClick={() => cast.onDress({ id: o.value, name: o.label })} aria-label={t("avatar.dressNamed", { name: o.label })}>
                  <IconEdit />
                  <span>{t("avatar.dress")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <HrmEmpty icon={IconUsers} title={needle ? t("board.noMatch") : t("avatar.noPeople")} />
      )}
    </HrmPanel>
  );
}

// ── Rooms ───────────────────────────────────────────────────────────────────

function Rooms({ opts, onChanged }: { opts: Opts; onChanged: () => void }) {
  const { t, roomType } = useLiveText();
  const [rows, setRows] = useState<LiveRoom[] | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState<LiveRoom | "new" | null>(null);
  useEffect(() => {
    const c = new AbortController();
    getLiveRooms({}, c.signal)
      .then((r) => !c.signal.aborted && (setRows(r), setErr("")))
      .catch((e) => !c.signal.aborted && (setRows([]), setErr(apiMessage(e, t("errors.load")))));
    return () => c.abort();
  }, [tick, t]);
  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) => opts.unitName(a.unitId).localeCompare(opts.unitName(b.unitId)) || a.order - b.order), [rows, opts]);
  return (
    <HrmPanel
      title={t("settings.rooms")}
      icon={IconBuilding}
      count={rows?.length}
      flush
      actions={
        <button type="button" className="btn btn--pri btn--sm" onClick={() => setEdit("new")}>
          <IconPlus />
          {t("rooms.new")}
        </button>
      }
    >
      {err ? <HrmError text={err} /> : null}
      {!rows ? (
        <div style={{ padding: 16 }}>
          <HrmLoading rows={3} />
        </div>
      ) : sorted.length ? (
        <div className="hrm-table-wrap">
          <table className="hrm-table">
            <thead>
              <tr>
                <th>{t("rooms.name")}</th>
                <th>{t("rooms.unit")}</th>
                <th>{t("rooms.type")}</th>
                <th className="hrm-num">{t("rooms.capacity")}</th>
                <th>{t("rooms.status")}</th>
                <th aria-label={t("rooms.edit")} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                    <small>{r.code}</small>
                  </td>
                  <td>{opts.unitName(r.unitId) || "—"}</td>
                  <td>
                    <span className={`lv-rtype lv-rtype--${r.type}`}>{roomType(r.type)}</span>
                  </td>
                  <td className="hrm-num">{r.capacity || "—"}</td>
                  <td>
                    <HrmStatus value={r.status} />
                  </td>
                  <td>
                    <button type="button" className="org-detail__edit" onClick={() => setEdit(r)} aria-label={t("rooms.edit")} title={t("rooms.edit")}>
                      <IconEdit />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <HrmEmpty icon={IconBuilding} title={t("rooms.empty")} text={t("rooms.emptyText")} />
      )}
      {edit ? (
        <RoomBuilder
          room={edit === "new" ? null : edit}
          unitOptions={opts.unitOptions}
          unitName={opts.unitName}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            setTick((n) => n + 1);
            onChanged();
          }}
        />
      ) : null}
    </HrmPanel>
  );
}

// ── Memberships ─────────────────────────────────────────────────────────────

function Memberships({ opts, onChanged }: { opts: Opts; onChanged: () => void }) {
  const { t, membership } = useLiveText();
  const f = useHrmFormat();
  const [employee, setEmployee] = useState("");
  const [rows, setRows] = useState<{ id: string; list: LiveMembership[] } | null>(null);
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    const c = new AbortController();
    getLiveRooms({ status: "active" }, c.signal).then((r) => !c.signal.aborted && setRooms(r)).catch(() => undefined);
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (!employee) return;
    const c = new AbortController();
    getMemberships(employee, c.signal)
      .then((list) => !c.signal.aborted && (setRows({ id: employee, list }), setErr("")))
      .catch((e) => !c.signal.aborted && setErr(apiMessage(e, t("errors.load"))));
    return () => c.abort();
  }, [employee, tick, t]);
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? "";
  const list = rows?.id === employee ? rows.list : null;
  return (
    <HrmPanel
      title={t("settings.memberships")}
      icon={IconUsers}
      actions={
        employee ? (
          <button type="button" className="btn btn--pri btn--sm" onClick={() => setAdding(true)}>
            <IconPlus />
            {t("memberships.new")}
          </button>
        ) : null
      }
    >
      <div className="lv-set__pick">
        <EntitySelect value={employee} onChange={setEmployee} options={opts.employeeOptions} placeholder={t("memberships.pickEmployee")} ariaLabel={t("memberships.employee")} />
      </div>
      {err ? <HrmError text={err} /> : null}
      {!employee ? (
        <HrmEmpty icon={IconUsers} title={t("memberships.pickTitle")} text={t("memberships.pickText")} />
      ) : !list ? (
        <HrmLoading rows={2} />
      ) : list.length ? (
        <ul className="lv-mem">
          {list.map((m) => (
            <li key={m.id || `${m.unitId}-${m.type}-${m.from}`} className={m.status !== "active" ? "is-off" : ""}>
              <span className={`lv-mtype lv-mtype--${m.type}`}>{membership(m.type)}</span>
              <b>{opts.unitName(m.unitId) || "—"}</b>
              {m.roomId ? <small>{roomName(m.roomId)}</small> : null}
              <small>{[m.from ? f.date(m.from) : "", m.to ? f.date(m.to) : t("detail.open")].filter(Boolean).join(" — ")}</small>
              <HrmStatus value={m.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="hrm-muted">{t("detail.noMemberships")}</p>
      )}
      {adding ? (
        <MembershipDrawer
          employee={employee}
          opts={opts}
          rooms={rooms}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setTick((n) => n + 1);
            onChanged();
          }}
        />
      ) : null}
    </HrmPanel>
  );
}

function MembershipDrawer({ employee, opts, rooms, onClose, onSaved }: { employee: string; opts: Opts; rooms: LiveRoom[]; onClose: () => void; onSaved: () => void }) {
  const { t, membership } = useLiveText();
  const [form, setForm] = useState({ unit: "", room: "", type: "primary", status: "active", fromDate: dayIso(0), fromTime: "09:00", toDate: "", toTime: "18:00" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof form) => (v: string) => setForm((c) => ({ ...c, [k]: v, ...(k === "unit" ? { room: "" } : {}) }));
  const roomOpts = rooms.filter((r) => !form.unit || r.unitId === form.unit).map((r) => ({ value: r.id, label: r.name, sub: r.code }));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !form.unit) return;
    setBusy(true);
    setErr("");
    try {
      await saveMembership({
        employee_id: employee,
        org_unit_id: form.unit,
        room_id: form.room || null,
        membership_type: form.type,
        status: form.status,
        effective_from: zonedIso(form.fromDate, form.fromTime),
        effective_to: form.toDate ? zonedIso(form.toDate, form.toTime) : null,
      });
      onSaved();
    } catch (cause) {
      setErr(apiMessage(cause, t("errors.save")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <HrmDrawer open onClose={onClose} title={t("memberships.new")}>
      <form className="hrm-form" onSubmit={submit}>
        {err ? <HrmError text={err} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("memberships.type")}>
            <Select value={form.type} onChange={set("type")} options={MEMBERSHIP_TYPES.map((x) => ({ value: x, label: membership(x) }))} ariaLabel={t("memberships.type")} />
          </InternalField>
          <InternalField label={t("rooms.unit")}>
            <EntitySelect value={form.unit} onChange={set("unit")} options={opts.unitOptions} placeholder={t("corrections.pickUnit")} ariaLabel={t("rooms.unit")} />
          </InternalField>
          <InternalField label={t("memberships.room")} hint={t("memberships.roomHint")}>
            <EntitySelect value={form.room} onChange={set("room")} options={roomOpts} placeholder={t("corrections.pickRoom")} ariaLabel={t("memberships.room")} />
          </InternalField>
          <InternalField label={t("rooms.status")}>
            <Select value={form.status} onChange={set("status")} options={["active", "inactive"].map((x) => ({ value: x, label: t(`roomStatus.${x}`) }))} ariaLabel={t("rooms.status")} />
          </InternalField>
          <InternalField label={t("memberships.from")}>
            <span className="lv-dt">
              <DatePicker value={form.fromDate} onChange={set("fromDate")} placeholder={t("memberships.from")} ariaLabel={t("memberships.from")} />
              <TimePicker value={form.fromTime} onChange={set("fromTime")} placeholder="09:00" ariaLabel={t("memberships.from")} />
            </span>
          </InternalField>
          <InternalField label={t("memberships.to")} hint={t("memberships.toHint")}>
            <span className="lv-dt">
              <DatePicker value={form.toDate} onChange={set("toDate")} placeholder={t("memberships.to")} ariaLabel={t("memberships.to")} min={form.fromDate} clearLabel={t("clear")} />
              <TimePicker value={form.toTime} onChange={set("toTime")} placeholder="18:00" ariaLabel={t("memberships.to")} />
            </span>
          </InternalField>
        </div>
        {form.type === "primary" ? <p className="hrm-form__note">{t("memberships.primaryNote")}</p> : null}
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !form.unit}>
            <IconCheck />
            {busy ? t("saving") : t("save")}
          </button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// ── Temporary access ────────────────────────────────────────────────────────

function Grants({ opts, known }: { opts: Opts; known: LiveGrant[] }) {
  const { t } = useLiveText();
  const f = useHrmFormat();
  const now = useNow(60_000);
  const [made, setMade] = useState<LiveGrant[]>([]);
  const [revoked, setRevoked] = useState<Record<string, true>>({});
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<LiveGrant | null>(null);
  const all = useMemo(() => {
    const m = new Map<string, LiveGrant>();
    for (const g of [...known, ...made]) m.set(g.id || `${g.granteeUserId}-${g.validUntil}`, g);
    return [...m.values()];
  }, [known, made]);
  const left = (until: string) => {
    const end = Date.parse(until);
    if (!Number.isFinite(end) || !now) return "";
    const min = Math.round((end - now) / 60000);
    if (min <= 0) return t("grants.expired");
    return min >= 60 ? t("grants.leftH", { h: Math.floor(min / 60), m: min % 60 }) : t("grants.leftM", { m: min });
  };
  const scopeName = (g: LiveGrant) => g.scopeName || (g.scopeType === "org_unit" ? opts.unitName(g.scopeId) : opts.employeeOptions.find((o) => o.value === g.scopeId)?.label) || "—";
  const who = (g: LiveGrant) => g.granteeName || opts.userOptions.find((o) => o.value === g.granteeUserId)?.label || "—";
  return (
    <HrmPanel
      title={t("settings.grants")}
      icon={IconLock}
      count={all.length}
      actions={
        <button type="button" className="btn btn--pri btn--sm" onClick={() => setAdding(true)}>
          <IconPlus />
          {t("grants.new")}
        </button>
      }
    >
      <p className="hrm-form__note">{t("grants.lead")}</p>
      {all.length ? (
        <ul className="lv-grants">
          {all.map((g) => {
            const off = revoked[g.id] || g.status === "revoked" || g.status === "expired" || left(g.validUntil) === t("grants.expired");
            return (
              <li key={g.id || g.validUntil} className={off ? "is-off" : ""}>
                <span className="lv-grants__t">
                  <b>{who(g)}</b>
                  <small>
                    {t(`grants.scope.${g.scopeType || "org_unit"}`)}: {scopeName(g)}
                  </small>
                  <small>
                    <IconClock /> {f.dateTime(g.validFrom)} — {f.dateTime(g.validUntil)}
                    {!off ? <em> · {left(g.validUntil)}</em> : null}
                  </small>
                  {g.reason ? <small>{g.reason}</small> : null}
                </span>
                {off ? (
                  <HrmStatus value={revoked[g.id] ? "revoked" : g.status === "active" ? "expired" : g.status} />
                ) : g.id ? (
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setRevoking(g)}>
                    {t("grants.revoke")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <HrmEmpty icon={IconLock} title={t("grants.empty")} />
      )}
      {adding ? (
        <GrantDrawer
          opts={opts}
          onClose={() => setAdding(false)}
          onSaved={(g) => {
            setAdding(false);
            setMade((cur) => [g, ...cur]);
          }}
        />
      ) : null}
      <ReasonModal
        open={!!revoking}
        title={t("grants.revokeTitle")}
        label={t("grants.revokeReason")}
        placeholder={t("grants.revokePh")}
        submitLabel={t("grants.revoke")}
        onClose={() => setRevoking(null)}
        onSubmit={async (reason) => {
          if (!revoking) return;
          await revokeGrant(revoking.id, reason);
          setRevoked((cur) => ({ ...cur, [revoking.id]: true }));
        }}
      />
    </HrmPanel>
  );
}

function GrantDrawer({ opts, onClose, onSaved }: { opts: Opts; onClose: () => void; onSaved: (g: LiveGrant) => void }) {
  const { t } = useLiveText();
  const [form, setForm] = useState({ user: "", scopeType: "org_unit", scope: "", fromDate: dayIso(0), fromTime: "09:00", toDate: dayIso(0), toTime: "18:00", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof form) => (v: string) => setForm((c) => ({ ...c, [k]: v, ...(k === "scopeType" ? { scope: "" } : {}) }));
  const from = zonedIso(form.fromDate, form.fromTime);
  const until = zonedIso(form.toDate, form.toTime);
  const badRange = !!from && !!until && Date.parse(until) <= Date.parse(from);
  const ready = form.user && form.scope && form.reason.trim() && from && until && !badRange;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setErr("");
    try {
      const g = await createGrant({ grantee_user_id: form.user, scope_type: form.scopeType, scope_id: form.scope, permissions: ["view"], valid_from: from, valid_until: until, reason: form.reason.trim() });
      onSaved({ ...g, granteeUserId: g.granteeUserId || form.user, scopeType: g.scopeType || form.scopeType, scopeId: g.scopeId || form.scope, validFrom: g.validFrom || from, validUntil: g.validUntil || until, reason: g.reason || form.reason.trim() });
    } catch (cause) {
      setErr(apiMessage(cause, t("errors.save")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <HrmDrawer open onClose={onClose} title={t("grants.new")} sub={t("grants.lead")}>
      <form className="hrm-form" onSubmit={submit}>
        {err ? <HrmError text={err} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("grants.grantee")}>
            <EntitySelect value={form.user} onChange={set("user")} options={opts.userOptions} placeholder={t("grants.pickUser")} ariaLabel={t("grants.grantee")} />
          </InternalField>
          <InternalField label={t("grants.scopeType")}>
            <Select value={form.scopeType} onChange={set("scopeType")} options={["org_unit", "employee"].map((x) => ({ value: x, label: t(`grants.scope.${x}`) }))} ariaLabel={t("grants.scopeType")} />
          </InternalField>
          <InternalField label={t(`grants.scope.${form.scopeType}`)}>
            <EntitySelect value={form.scope} onChange={set("scope")} options={form.scopeType === "org_unit" ? opts.unitOptions : opts.employeeOptions} placeholder={t("grants.pickScope")} ariaLabel={t(`grants.scope.${form.scopeType}`)} />
          </InternalField>
          <InternalField label={t("grants.from")}>
            <span className="lv-dt">
              <DatePicker value={form.fromDate} onChange={set("fromDate")} placeholder={t("grants.from")} ariaLabel={t("grants.from")} />
              <TimePicker value={form.fromTime} onChange={set("fromTime")} placeholder="09:00" ariaLabel={t("grants.from")} />
            </span>
          </InternalField>
          <InternalField label={t("grants.until")}>
            <span className="lv-dt">
              <DatePicker value={form.toDate} onChange={set("toDate")} placeholder={t("grants.until")} ariaLabel={t("grants.until")} min={form.fromDate} />
              <TimePicker value={form.toTime} onChange={set("toTime")} placeholder="18:00" ariaLabel={t("grants.until")} />
            </span>
          </InternalField>
          <InternalField label={t("grants.reason")}>
            <textarea value={form.reason} onChange={(e) => set("reason")(e.target.value)} rows={2} maxLength={500} required placeholder={t("grants.reasonPh")} />
          </InternalField>
        </div>
        {badRange ? <HrmError text={t("grants.badRange")} /> : <p className="hrm-form__note">{t("grants.viewOnly")}</p>}
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !ready}>
            <IconCheck />
            {busy ? t("saving") : t("grants.give")}
          </button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// ── Activity registry ───────────────────────────────────────────────────────

function Registry({ opts }: { opts: Opts }) {
  const { t, module } = useLiveText();
  const [rows, setRows] = useState<RegistryRule[] | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    const c = new AbortController();
    getActivityRegistry(c.signal)
      .then((r) => !c.signal.aborted && (setRows(r), setErr("")))
      .catch((e) => !c.signal.aborted && (setRows([]), setErr(apiMessage(e, t("errors.load")))));
    return () => c.abort();
  }, [tick, t]);
  const needle = q.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !needle || `${r.path} ${r.label} ${r.module} ${r.code}`.toLowerCase().includes(needle));
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return (
    <HrmPanel
      title={t("settings.registry")}
      icon={IconList}
      count={rows?.length}
      flush
      actions={
        <button type="button" className="btn btn--pri btn--sm" onClick={() => setAdding(true)}>
          <IconPlus />
          {t("registry.new")}
        </button>
      }
    >
      <div className="lv-set__pick">
        <div className="uf-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("registry.search")} aria-label={t("registry.search")} />
        </div>
      </div>
      {err ? <HrmError text={err} /> : null}
      {!rows ? (
        <div style={{ padding: 16 }}>
          <HrmLoading rows={3} />
        </div>
      ) : shown.length ? (
        <div className="hrm-table-wrap">
          <table className="hrm-table lv-reg">
            <thead>
              <tr>
                <th>{t("registry.request")}</th>
                <th>{t("registry.label")}</th>
                <th>{t("registry.module")}</th>
                <th>{t("registry.link")}</th>
                <th>{t("rooms.status")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`lv-method lv-method--${r.method.toLowerCase()}`}>{r.method}</span>
                    <code>{r.path}</code>
                  </td>
                  <td>
                    <b>{r.label}</b>
                    <small>{r.code}</small>
                  </td>
                  <td>{module(r.module)}</td>
                  <td>
                    <code>{r.detailUrl || "—"}</code>
                  </td>
                  <td>
                    <HrmStatus value={r.active ? "active" : "inactive"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <HrmEmpty icon={IconLayers} title={t("registry.empty")} />
      )}
      {adding ? (
        <RegistryDrawer
          opts={opts}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
    </HrmPanel>
  );
}

function RegistryDrawer({ opts, onClose, onSaved }: { opts: Opts; onClose: () => void; onSaved: () => void }) {
  const { t } = useLiveText();
  const [form, setForm] = useState({ method: "POST", path: "", module: "", code: "", label: "", entity: "", detail: "", unit: "", active: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof form) => (v: string) => setForm((c) => ({ ...c, [k]: v }));
  const ok = form.path.trim().startsWith("/") && form.module.trim() && form.code.trim() && form.label.trim();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !ok) return;
    setBusy(true);
    setErr("");
    try {
      await createRegistryRule({
        method: form.method,
        path_pattern: form.path.trim(),
        module: form.module.trim(),
        action_code: form.code.trim(),
        action_label: form.label.trim(),
        entity_type: form.entity.trim() || null,
        detail_url_pattern: form.detail.trim() || null,
        org_unit_id: form.unit || null,
        room_id: null,
        is_active: form.active,
        meta: {},
      });
      onSaved();
    } catch (cause) {
      setErr(apiMessage(cause, t("errors.save")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <HrmDrawer open onClose={onClose} title={t("registry.new")} sub={t("registry.lead")}>
      <form className="hrm-form" onSubmit={submit}>
        {err ? <HrmError text={err} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("registry.method")}>
            <Select value={form.method} onChange={set("method")} options={["POST", "PATCH", "PUT", "DELETE"].map((x) => ({ value: x, label: x }))} ariaLabel={t("registry.method")} />
          </InternalField>
          <InternalField label={t("registry.path")} hint={t("registry.pathHint")}>
            <input value={form.path} onChange={(e) => set("path")(e.target.value)} maxLength={300} required placeholder="/module/items/{id}/submit" />
          </InternalField>
          <InternalField label={t("registry.module")}>
            <input value={form.module} onChange={(e) => set("module")(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} maxLength={60} required placeholder="studio" />
          </InternalField>
          <InternalField label={t("registry.code")}>
            <input value={form.code} onChange={(e) => set("code")(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "_"))} maxLength={120} required placeholder="module.item.submitted" />
          </InternalField>
          <InternalField label={t("registry.label")}>
            <input value={form.label} onChange={(e) => set("label")(e.target.value)} maxLength={200} required placeholder={t("registry.labelPh")} />
          </InternalField>
          <InternalField label={t("registry.entity")}>
            <input value={form.entity} onChange={(e) => set("entity")(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} maxLength={60} placeholder="module_item" />
          </InternalField>
          <InternalField label={t("registry.link")} hint={t("registry.linkHint")}>
            <input value={form.detail} onChange={(e) => set("detail")(e.target.value)} maxLength={300} placeholder="/module/items/{id}" />
          </InternalField>
          <InternalField label={t("rooms.unit")}>
            <EntitySelect value={form.unit} onChange={set("unit")} options={opts.unitOptions} placeholder={t("registry.anyUnit")} ariaLabel={t("rooms.unit")} />
          </InternalField>
        </div>
        <label className="stu-check lv-check">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((c) => ({ ...c, active: e.target.checked }))} />
          <span>{t("registry.active")}</span>
        </label>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !ok}>
            <IconCheck />
            {busy ? t("saving") : t("save")}
          </button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </HrmDrawer>
  );
}
