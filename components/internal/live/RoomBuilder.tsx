"use client";

import { useMemo, useState, type ComponentType, type CSSProperties, type SVGProps } from "react";
import { asDict } from "@/lib/http";
import { ROOM_TYPES, createRoom, updateRoom, type LiveRoom } from "@/lib/services/internalLive";
import type { SearchOption } from "@/components/SearchSelect";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconBuilding, IconCheck, IconGlobe, IconLayers, IconMinus, IconPlus, IconSparkle } from "@/components/icons";
import { EntitySelect, HrmError } from "@/components/internal/HrmUi";
import { Block, U, boxOf, pt } from "@/components/live/floorKit";
import { FloorDefs } from "@/components/live/floorArt";
import { apiMessage, useLiveText } from "./bits";
import { TINTS, codeFrom, deskGrid, tintOf, type Dict } from "./roomPlan";
import { RoomArt, SIDE, THEMES, chosenTheme, themeOf, type ThemeId } from "./roomArt";

const TYPE_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = { virtual: IconGlobe, physical: IconBuilding, hybrid: IconLayers };
const QUICK = [4, 8, 12, 20];
const MAX_CAP = 200;

// A new room, or one to change, built while it is drawn: the type, the
// name, the department, how many seats and a colour, with the room itself
// standing beside the form (above it on a phone), growing desks as the
// seats are counted.
export default function RoomBuilder({ room, unitOptions, unitName, defaultUnit = "", onClose, onSaved }: { room: LiveRoom | null; unitOptions: SearchOption[]; unitName: (id: string) => string; defaultUnit?: string; onClose: () => void; onSaved: () => void }) {
  const { t, roomType } = useLiveText();
  const meta = asDict(room?.raw.meta);
  const [type, setType] = useState(room?.type ?? "physical");
  const [unit, setUnit] = useState(room?.unitId ?? defaultUnit);
  const [name, setName] = useState(room?.name ?? "");
  const [code, setCode] = useState(room?.code ?? "");
  const [ownCode, setOwnCode] = useState(Boolean(room));
  const [cap, setCap] = useState(room?.capacity || 8);
  const [tint, setTint] = useState<number | null>(tintOf(meta));
  const [theme, setTheme] = useState<ThemeId | null>(chosenTheme(meta));
  const [status, setStatus] = useState(room?.status ?? "active");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const shownCode = ownCode ? code : codeFrom(name);
  const ok = Boolean(unit && name.trim() && shownCode.trim());

  async function save() {
    if (busy || !ok) return;
    setBusy(true);
    setErr("");
    const nextMeta: Dict = { ...meta };
    if (tint === null) delete nextMeta.tint;
    else nextMeta.tint = tint;
    if (theme === null) delete nextMeta.theme;
    else nextMeta.theme = theme;
    const payload = { org_unit_id: unit, code: shownCode.trim(), name: name.trim(), room_type: type, capacity: cap, status, order_index: room?.order ?? 10, meta: nextMeta };
    try {
      if (room) await updateRoom(room.id, payload);
      else await createRoom(payload);
      onSaved();
    } catch (cause) {
      setErr(apiMessage(cause, t("errors.save")));
    } finally {
      setBusy(false);
    }
  }

  // The style the room will have: the one picked, or the one its names give.
  const shownTheme = theme ?? themeOf({}, [name, shownCode, unitName(unit)], type, room?.id ?? "new");
  const bump = (n: number) => setCap((c) => Math.min(MAX_CAP, Math.max(1, c + n)));

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      dirty={!room && Boolean(name.trim())}
      size="xl"
      title={room ? t("rooms.edit") : t("builder.title")}
      description={room ? room.name : t("builder.lead")}
      aiId="internal.live.room-builder"
      footer={
        <>
          <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy}>{t("cancel")}</button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => void save()} disabled={busy || !ok}>
            {room ? <IconCheck /> : <IconSparkle />}
            {busy ? t("saving") : room ? t("save") : t("builder.create")}
          </button>
        </>
      }
    >
      <div className="lfb">
        <div className="lfb__form">
          {err ? <HrmError text={err} /> : null}
          <div className="lfb__types" role="radiogroup" aria-label={t("rooms.type")}>
            {ROOM_TYPES.map((x) => {
              const Ico = TYPE_ICON[x] ?? IconBuilding;
              return (
                <button key={x} type="button" role="radio" aria-checked={type === x} className={`lfb__type lfb__type--${x}${type === x ? " is-on" : ""}`} onClick={() => setType(x)}>
                  <span className="lfb__glyph" aria-hidden><Ico /></span>
                  <b>{roomType(x)}</b>
                  <small>{t(`builder.type.${x}`)}</small>
                </button>
              );
            })}
          </div>

          <label className="internal-field">
            <span className="internal-field__label">{t("rooms.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus placeholder={t("rooms.namePh")} />
          </label>
          <div className="lfb__row">
            <div className="internal-field">
              <span className="internal-field__label">{t("rooms.unit")}</span>
              <EntitySelect value={unit} onChange={setUnit} options={unitOptions} placeholder={t("corrections.pickUnit")} ariaLabel={t("rooms.unit")} />
            </div>
            <label className="internal-field">
              <span className="internal-field__label">{t("rooms.code")}</span>
              <input
                value={shownCode}
                onChange={(e) => {
                  setOwnCode(true);
                  setCode(e.target.value.toUpperCase());
                }}
                maxLength={40}
                placeholder="STUDIO-01"
              />
              {!ownCode && name.trim() ? <small className="internal-field__hint">{t("builder.codeAuto")}</small> : null}
            </label>
          </div>

          <div className="internal-field">
            <span className="internal-field__label" id="lfb-cap">{t("rooms.capacity")}</span>
            <div className="lfb__cap">
              <div className="lfb__step" role="group" aria-labelledby="lfb-cap">
                <button type="button" onClick={() => bump(-1)} disabled={cap <= 1} aria-label={t("builder.less")}><IconMinus /></button>
                <input value={cap} onChange={(e) => setCap(Math.min(MAX_CAP, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))} inputMode="numeric" aria-labelledby="lfb-cap" />
                <button type="button" onClick={() => bump(1)} disabled={cap >= MAX_CAP} aria-label={t("builder.more")}><IconPlus /></button>
              </div>
              <div className="lfb__quick">
                {QUICK.map((n) => (
                  <button key={n} type="button" className={cap === n ? "is-on" : ""} aria-pressed={cap === n} onClick={() => setCap(n)}>{n}</button>
                ))}
              </div>
            </div>
            <small className="internal-field__hint">{t("builder.seats", { desks: Math.ceil(Math.min(cap, 16) / 4), n: cap })}</small>
          </div>

          <div className="internal-field">
            <span className="internal-field__label" id="lfb-style">{t("builder.style")}</span>
            <div className="lfb__styles" role="radiogroup" aria-labelledby="lfb-style">
              <button type="button" role="radio" aria-checked={theme === null} className={`lfb__style lfb__style--auto${theme === null ? " is-on" : ""}`} onClick={() => setTheme(null)} title={t("builder.styleAutoHint")}>
                <i aria-hidden />
                <span>{t("builder.auto")}</span>
                {theme === null ? <small>{t(`theme.${shownTheme}`)}</small> : null}
              </button>
              {THEMES.map((x) => (
                <button key={x} type="button" role="radio" aria-checked={theme === x} className={`lfb__style lfb__style--${x}${theme === x ? " is-on" : ""}`} onClick={() => setTheme(x)}>
                  <i aria-hidden />
                  <span>{t(`theme.${x}`)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="internal-field">
            <span className="internal-field__label" id="lfb-tint">{t("builder.color")}</span>
            <div className="lfb__tints" role="radiogroup" aria-labelledby="lfb-tint">
              <button type="button" role="radio" aria-checked={tint === null} className={`lfb__tint lfb__tint--auto${tint === null ? " is-on" : ""}`} onClick={() => setTint(null)} title={t("builder.colorAuto")}>
                <span>{t("builder.auto")}</span>
              </button>
              {TINTS.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={tint === n} aria-label={t("builder.colorN", { n: n + 1 })} className={`lfb__tint lfb__tint--t${n}${tint === n ? " is-on" : ""}`} onClick={() => setTint(n)} />
              ))}
            </div>
          </div>

          {room ? (
            <div className="internal-field">
              <span className="internal-field__label">{t("rooms.status")}</span>
              <Select value={status} onChange={setStatus} options={["active", "inactive", "archived"].map((x) => ({ value: x, label: t(`roomStatus.${x}`) }))} ariaLabel={t("rooms.status")} />
            </div>
          ) : null}
        </div>

        <RoomStage type={type} theme={shownTheme} name={name.trim() || t("builder.untitled")} unit={[unitName(unit), t(`theme.${shownTheme}`)].filter(Boolean).join(" · ")} cap={cap} tint={tint} label={t("builder.preview")} seatsLabel={t("builder.seatsShort", { n: cap })} />
      </div>
    </Modal>
  );
}

// The room as it will stand on the office floor, drawn with the floor's own
// furniture. Only the first sixteen seats get desks, as on the floor.
function RoomStage({ type, theme, name, unit, cap, tint, label, seatsLabel }: { type: string; theme: ThemeId; name: string; unit: string; cap: number; tint: number | null; label: string; seatsLabel: string }) {
  const g = useMemo(() => deskGrid(Math.min(cap, 16)), [cap]);
  const w = g.w + SIDE;
  const box = boxOf(-0.6, -0.6, w + 1.2, g.d + 1.2, U * 0.9, 2.6);
  const [lx, ly] = pt(w / 2, 0.1, 2.3);
  // A few seats taken, so the screens light up.
  const taken = g.desks.map((_, i) => [i === 0, false, i === 0, i % 2 === 1]);
  return (
    <figure className="lf lfb__stage" aria-label={label}>
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={`${name} · ${seatsLabel}`} style={{ "--lf-k": (box.w / 420).toFixed(3) } as CSSProperties}>
        <FloorDefs />
        <Block x={-0.6} y={-0.6} w={w + 1.2} d={g.d + 1.2} h={0.35} z={-0.35} cls="lf-m-slab" />
        <g key={`${theme}-${g.desks.length}`} className={`lf-room lf-room--t${tint ?? 0} lf-room--${type} lfb__room`}>
          <RoomArt x={0} y={0} w={w} d={g.d} gw={g.w} theme={theme} type={type} desks={g.desks} taken={taken} tint={tint} />
        </g>
        <text className="lf-label" x={lx.toFixed(1)} y={ly.toFixed(1)}>
          {name}
        </text>
      </svg>
      <figcaption>
        <b>{name}</b>
        <span>{[unit, seatsLabel].filter(Boolean).join(" · ")}</span>
      </figcaption>
    </figure>
  );
}
